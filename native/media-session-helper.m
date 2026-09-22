#import <Foundation/Foundation.h>
#import <AppKit/AppKit.h>
#import <CoreFoundation/CoreFoundation.h>
#import <CoreAudio/CoreAudio.h>
#import <dlfcn.h>
#import <math.h>

typedef void (*MRGetInfoFn)(dispatch_queue_t, void (^)(CFDictionaryRef));
typedef void (*MRGetPlayingFn)(dispatch_queue_t, void (^)(Boolean));
typedef void (*MRGetPlaybackStateFn)(dispatch_queue_t, void (^)(int));
typedef void (*MRGetPIDFn)(dispatch_queue_t, void (^)(int));
typedef void (*MRSendCommandFn)(int, CFDictionaryRef);

static MRGetInfoFn getNowPlayingInfo = NULL;
static MRGetPlayingFn getNowPlayingPlaying = NULL;
static MRGetPlaybackStateFn getNowPlayingPlaybackState = NULL;
static MRGetPIDFn getNowPlayingPID = NULL;
static MRSendCommandFn sendMediaCommand = NULL;
static float getOutputVolume(void);
static CFStringRef optionPlaybackPosition = NULL;

static NSString *stringValue(NSDictionary *dictionary, NSString *key) {
  id value = dictionary[key];
  if ([value isKindOfClass:[NSString class]]) return value;
  if ([value respondsToSelector:@selector(stringValue)]) return [value stringValue];
  return @"";
}

static NSNumber *numberValue(NSDictionary *dictionary, NSString *key) {
  id value = dictionary[key];
  if ([value isKindOfClass:[NSNumber class]]) return value;
  if ([value isKindOfClass:[NSString class]]) {
    return @([value doubleValue]);
  }
  return @0;
}

static void writeJSON(NSDictionary *payload) {
  NSError *error = nil;
  NSData *data = [NSJSONSerialization dataWithJSONObject:payload options:0 error:&error];
  if (!data) {
    fprintf(stdout, "{\"ok\":false,\"error\":\"json_encode_failed\"}\n");
    fflush(stdout);
    return;
  }
  fwrite(data.bytes, 1, data.length, stdout);
  fputc('\n', stdout);
  fflush(stdout);
}

static NSDictionary *collectStatus(void) {
  __block CFDictionaryRef retainedInfo = NULL;
  __block Boolean playing = false;
  __block int playbackState = 0;
  __block int pid = 0;
  dispatch_semaphore_t infoDone = dispatch_semaphore_create(0);
  dispatch_semaphore_t playingDone = dispatch_semaphore_create(0);
  dispatch_semaphore_t playbackStateDone = dispatch_semaphore_create(0);
  dispatch_semaphore_t pidDone = dispatch_semaphore_create(0);
  dispatch_queue_t queue = dispatch_get_global_queue(QOS_CLASS_USER_INITIATED, 0);

  getNowPlayingInfo(queue, ^(CFDictionaryRef value) {
    if (value) retainedInfo = CFRetain(value);
    dispatch_semaphore_signal(infoDone);
  });
  getNowPlayingPlaying(queue, ^(Boolean value) {
    playing = value;
    dispatch_semaphore_signal(playingDone);
  });
  getNowPlayingPlaybackState(queue, ^(int value) {
    playbackState = value;
    dispatch_semaphore_signal(playbackStateDone);
  });
  getNowPlayingPID(queue, ^(int value) {
    pid = value;
    dispatch_semaphore_signal(pidDone);
  });

  dispatch_time_t timeout = dispatch_time(DISPATCH_TIME_NOW, 800 * NSEC_PER_MSEC);
  dispatch_semaphore_wait(infoDone, timeout);
  dispatch_semaphore_wait(playingDone, timeout);
  dispatch_semaphore_wait(playbackStateDone, timeout);
  dispatch_semaphore_wait(pidDone, timeout);

  NSDictionary *info = retainedInfo
    ? (__bridge_transfer NSDictionary *)retainedInfo
    : @{};
  NSString *appName = @"";
  NSString *bundleId = @"";
  NSString *appPath = @"";
  if (pid > 0) {
    NSRunningApplication *application = [NSRunningApplication runningApplicationWithProcessIdentifier:pid];
    if (application) {
      appName = application.localizedName ?: @"";
      bundleId = application.bundleIdentifier ?: @"";
      appPath = application.bundleURL.path ?: @"";
    }
  }

  NSData *artwork = nil;
  id artworkValue = info[@"kMRMediaRemoteNowPlayingInfoArtworkData"];
  if ([artworkValue isKindOfClass:[NSData class]] && [artworkValue length] > 0 && [artworkValue length] <= 2 * 1024 * 1024) {
    artwork = artworkValue;
  }
  NSString *artworkMime = stringValue(info, @"kMRMediaRemoteNowPlayingInfoArtworkMIMEType");
  if (!artworkMime.length) artworkMime = @"image/jpeg";

  double duration = numberValue(info, @"kMRMediaRemoteNowPlayingInfoDuration").doubleValue;
  double elapsed = numberValue(info, @"kMRMediaRemoteNowPlayingInfoElapsedTime").doubleValue;
  double rate = numberValue(info, @"kMRMediaRemoteNowPlayingInfoPlaybackRate").doubleValue;
  NSString *title = stringValue(info, @"kMRMediaRemoteNowPlayingInfoTitle");
  NSString *artist = stringValue(info, @"kMRMediaRemoteNowPlayingInfoArtist");
  NSString *album = stringValue(info, @"kMRMediaRemoteNowPlayingInfoAlbum");
  BOOL active = pid > 0 || title.length > 0;

  return @{
    @"ok": @true,
    @"active": @(active),
    @"playing": @(playing),
    @"playbackState": @(playbackState),
    @"pid": @(pid),
    @"appName": appName,
    @"bundleId": bundleId,
    @"appPath": appPath,
    @"title": title,
    @"artist": artist,
    @"album": album,
    @"duration": @(duration),
    @"elapsed": @(elapsed),
    @"playbackRate": @(rate),
    @"volume": @(getOutputVolume() * 100.0),
    @"artworkMime": artworkMime,
    @"artworkBase64": artwork ? [artwork base64EncodedStringWithOptions:0] : @"",
  };
}

static int commandForAction(NSString *action) {
  if ([action isEqualToString:@"play"]) return 0;
  if ([action isEqualToString:@"pause"]) return 1;
  if ([action isEqualToString:@"toggle"]) return 2;
  if ([action isEqualToString:@"next"]) return 4;
  if ([action isEqualToString:@"previous"]) return 5;
  return -1;
}

static BOOL setOutputVolume(float volume) {
  AudioObjectPropertyAddress address = {
    kAudioHardwarePropertyDefaultOutputDevice,
    kAudioObjectPropertyScopeGlobal,
    kAudioObjectPropertyElementMain,
  };
  AudioDeviceID device = kAudioObjectUnknown;
  UInt32 size = sizeof(device);
  if (AudioObjectGetPropertyData(
    kAudioObjectSystemObject,
    &address,
    0,
    NULL,
    &size,
    &device
  ) != noErr || device == kAudioObjectUnknown) {
    return NO;
  }
  address.mSelector = kAudioDevicePropertyVolumeScalar;
  address.mScope = kAudioDevicePropertyScopeOutput;
  address.mElement = kAudioObjectPropertyElementMain;
  if (AudioObjectSetPropertyData(device, &address, 0, NULL, sizeof(volume), &volume) == noErr) {
    return YES;
  }
  BOOL changed = NO;
  for (UInt32 channel = 1; channel <= 2; channel++) {
    address.mElement = channel;
    if (AudioObjectSetPropertyData(device, &address, 0, NULL, sizeof(volume), &volume) == noErr) {
      changed = YES;
    }
  }
  return changed;
}

static float getOutputVolume(void) {
  AudioObjectPropertyAddress address = {
    kAudioHardwarePropertyDefaultOutputDevice,
    kAudioObjectPropertyScopeGlobal,
    kAudioObjectPropertyElementMain,
  };
  AudioDeviceID device = kAudioObjectUnknown;
  UInt32 size = sizeof(device);
  if (AudioObjectGetPropertyData(
    kAudioObjectSystemObject,
    &address,
    0,
    NULL,
    &size,
    &device
  ) != noErr || device == kAudioObjectUnknown) {
    return -1;
  }
  address.mSelector = kAudioDevicePropertyVolumeScalar;
  address.mScope = kAudioDevicePropertyScopeOutput;
  address.mElement = kAudioObjectPropertyElementMain;
  Float32 volume = 0;
  size = sizeof(volume);
  if (AudioObjectGetPropertyData(device, &address, 0, NULL, &size, &volume) == noErr) {
    return volume;
  }
  Float32 total = 0;
  int count = 0;
  for (UInt32 channel = 1; channel <= 2; channel++) {
    address.mElement = channel;
    if (AudioObjectGetPropertyData(device, &address, 0, NULL, &size, &volume) == noErr) {
      total += volume;
      count += 1;
    }
  }
  return count ? total / count : -1;
}

int main(void) {
  @autoreleasepool {
    void *handle = dlopen("/System/Library/PrivateFrameworks/MediaRemote.framework/MediaRemote", RTLD_LAZY);
    if (!handle) {
      writeJSON(@{ @"ok": @false, @"error": @"mediaremote_unavailable" });
      return 2;
    }
    getNowPlayingInfo = (MRGetInfoFn)dlsym(handle, "MRMediaRemoteGetNowPlayingInfo");
    getNowPlayingPlaying = (MRGetPlayingFn)dlsym(handle, "MRMediaRemoteGetNowPlayingApplicationIsPlaying");
    getNowPlayingPlaybackState = (MRGetPlaybackStateFn)dlsym(handle, "MRMediaRemoteGetNowPlayingApplicationPlaybackState");
    getNowPlayingPID = (MRGetPIDFn)dlsym(handle, "MRMediaRemoteGetNowPlayingApplicationPID");
    sendMediaCommand = (MRSendCommandFn)dlsym(handle, "MRMediaRemoteSendCommand");
    CFStringRef *positionKey = (CFStringRef *)dlsym(handle, "kMRMediaRemoteOptionPlaybackPosition");
    if (positionKey) optionPlaybackPosition = *positionKey;
    if (!getNowPlayingInfo || !getNowPlayingPlaying || !getNowPlayingPlaybackState || !getNowPlayingPID || !sendMediaCommand) {
      writeJSON(@{ @"ok": @false, @"error": @"mediaremote_symbols_missing" });
      return 3;
    }

    setvbuf(stdout, NULL, _IOLBF, 0);
    writeJSON(@{ @"ok": @true, @"ready": @true });
    char line[256];
    while (fgets(line, sizeof(line), stdin)) {
      @autoreleasepool {
        NSString *command = [[NSString stringWithUTF8String:line]
          stringByTrimmingCharactersInSet:[NSCharacterSet whitespaceAndNewlineCharacterSet]];
        if ([command isEqualToString:@"status"]) {
          writeJSON(collectStatus());
        } else if ([command isEqualToString:@"activate"]) {
          NSDictionary *status = collectStatus();
          int pid = [status[@"pid"] intValue];
          NSRunningApplication *application = pid > 0
            ? [NSRunningApplication runningApplicationWithProcessIdentifier:pid]
            : nil;
          BOOL activated = application
            ? [application activateWithOptions:0]
            : NO;
          writeJSON(@{ @"ok": @(activated), @"command": @"activate" });
        } else if ([command hasPrefix:@"volume:"]) {
          double rawVolume = [[command substringFromIndex:7] doubleValue];
          float volume = MAX(0.0f, MIN(1.0f, (float)(rawVolume / 100.0)));
          writeJSON(@{ @"ok": @(setOutputVolume(volume)), @"command": command });
        } else if ([command hasPrefix:@"seek:"]) {
          double position = [[command substringFromIndex:5] doubleValue];
          if (!optionPlaybackPosition || !isfinite(position)) {
            writeJSON(@{ @"ok": @false, @"error": @"seek_unavailable" });
          } else {
            NSDictionary *options = @{ (__bridge id)optionPlaybackPosition: @(MAX(0.0, position)) };
            sendMediaCommand(18, (__bridge CFDictionaryRef)options);
            writeJSON(@{ @"ok": @true, @"command": command });
          }
        } else if ([command isEqualToString:@"quit"]) {
          break;
        } else {
          int mediaCommand = commandForAction(command);
          if (mediaCommand >= 0) {
            sendMediaCommand(mediaCommand, NULL);
            writeJSON(@{ @"ok": @true, @"command": command });
          } else {
            writeJSON(@{ @"ok": @false, @"error": @"invalid_command" });
          }
        }
      }
    }
    dlclose(handle);
  }
  return 0;
}
