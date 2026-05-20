import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Dimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, spacing } from '@app/theme';
import { Icon } from '@shared/components/Icon';
import { streamingService, type StreamQuality } from '@services/streaming/streamingService';
import type { Camera, CameraStream } from '@shared/types';

interface VideoPlayerProps {
  camera: Camera;
  quality?: StreamQuality;
  onError?: (error: string) => void;
  onReady?: () => void;
}

const { width: screenWidth } = Dimensions.get('window');

export function VideoPlayer({
  camera,
  quality = 'medium',
  onError,
  onReady,
}: VideoPlayerProps): React.ReactElement {
  const insets = useSafeAreaInsets();
  const [stream, setStream] = useState<CameraStream | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showControls, setShowControls] = useState(true);
  const [isFullscreen, setIsFullscreen] = useState(false);

  useEffect(() => {
    initializeStream();
  }, [camera.id]);

  const initializeStream = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      streamingService.setConfig(camera.id, { quality: quality || 'medium' });
      const success = await streamingService.connect(camera);

      if (success) {
        const cameraStream = streamingService.getStream(camera.id);
        setStream(cameraStream || null);
        onReady?.();
      } else {
        setError('Falha ao conectar stream');
        onError?.('Connection failed');
      }
    } catch (err) {
      setError(String(err));
      onError?.(String(err));
    } finally {
      setIsLoading(false);
    }
  }, [camera.id, camera.streamUrl, quality, onReady, onError]);

  const handleQualityChange = useCallback(async (newQuality: StreamQuality) => {
    await streamingService.changeQuality(camera.id, newQuality);
    const updatedStream = streamingService.getStream(camera.id);
    setStream(updatedStream || null);
  }, [camera.id]);

  const handleToggleFullscreen = useCallback(() => {
    setIsFullscreen(prev => !prev);
  }, []);

  const handleToggleControls = useCallback(() => {
    setShowControls(prev => !prev);
  }, []);

  const handleRetry = useCallback(() => {
    initializeStream();
  }, [initializeStream]);

  useEffect(() => {
    let interval: ReturnType<typeof setInterval>;
    if (stream?.isPlaying) {
      interval = setInterval(() => {
        const updatedStream = streamingService.getStream(camera.id);
        if (updatedStream) {
          setStream(updatedStream);
        }
      }, 1000);
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [camera.id, stream?.isPlaying]);

  const getStatusColor = () => {
    if (error) return colors.error;
    if (stream?.isPlaying) return colors.live;
    return colors.warning;
  };

  const containerStyle = isFullscreen 
    ? [styles.fullscreenContainer, { backgroundColor: colors.background }] 
    : [styles.container, { backgroundColor: colors.surface }];

  return (
    <TouchableOpacity
      activeOpacity={0.9}
      onPress={handleToggleControls}
      style={containerStyle}
    >
      <View style={styles.videoWrapper}>
        {isLoading && (
          <View style={styles.loadingOverlay}>
            <ActivityIndicator size="large" color={colors.secondary} />
            <Text style={styles.loadingText}>Conectando...</Text>
          </View>
        )}

        {error && (
          <View style={styles.errorOverlay}>
            <Icon name="alert-circle" size={40} color={colors.error} />
            <Text style={styles.errorText}>{error}</Text>
            <TouchableOpacity style={styles.retryButton} onPress={handleRetry}>
              <Text style={styles.retryText}>Tentar novamente</Text>
            </TouchableOpacity>
          </View>
        )}

        {!isLoading && !error && (
          <View style={styles.videoPlaceholder}>
            <Icon name="video" size={60} color={colors.textMuted} />
            <Text style={styles.streamUrl}>{camera.streamUrl}</Text>
            
            {stream?.isPlaying && (
              <View style={styles.streamStats}>
                <Text style={styles.statText}>
                  {stream.currentFps} FPS | {Math.round(stream.bitrate / 1000)} Kbps
                </Text>
              </View>
            )}
          </View>
        )}

        {stream?.isPlaying && (
          <View style={styles.overlay}>
            <View style={styles.overlayLeft}>
              <View style={[styles.statusIndicator, { backgroundColor: getStatusColor() }]} />
              <Text style={styles.liveText}>LIVE</Text>
            </View>

            <View style={styles.overlayRight}>
              {stream.isRecording && (
                <View style={styles.recordingBadge}>
                  <Icon name="record-circle" size={12} color={colors.recording} />
                  <Text style={styles.recordingText}>REC</Text>
                </View>
              )}
            </View>
          </View>
        )}

        {stream?.isPlaying && showControls && (
          <View style={styles.bottomOverlay}>
            <Text style={styles.timestamp}>
              {new Date().toLocaleString('pt-BR')}
            </Text>

            <View style={styles.qualitySelector}>
              {(['low', 'medium', 'high'] as const).map((q) => (
                <TouchableOpacity
                  key={q}
                  style={[
                    styles.qualityButton,
                    stream?.quality === q && styles.qualityButtonActive,
                  ]}
                  onPress={() => handleQualityChange(q)}
                >
                  <Text
                    style={[
                      styles.qualityText,
                      stream?.quality === q && styles.qualityTextActive,
                    ]}
                  >
                    {q.toUpperCase()}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        )}
      </View>

      {isFullscreen && showControls && (
        <TouchableOpacity
          style={styles.exitFullscreen}
          onPress={handleToggleFullscreen}
        >
          <Icon name="fullscreen-exit" size={28} color={colors.text} />
        </TouchableOpacity>
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: {
    width: '100%',
    aspectRatio: 16 / 9,
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: colors.surface,
  },
  fullscreenContainer: {
    flex: 1,
    backgroundColor: colors.background,
  },
  videoWrapper: {
    flex: 1,
  },
  loadingOverlay: {
    ...StyleSheet.absoluteFill,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: colors.overlay,
  },
  loadingText: {
    marginTop: spacing.md,
    color: colors.textSecondary,
    fontSize: 14,
  },
  errorOverlay: {
    ...StyleSheet.absoluteFill,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: colors.overlay,
  },
  errorText: {
    marginTop: spacing.md,
    color: colors.error,
    fontSize: 14,
    textAlign: 'center',
    paddingHorizontal: spacing.lg,
  },
  retryButton: {
    marginTop: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    backgroundColor: colors.secondary,
    borderRadius: 8,
  },
  retryText: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '600',
  },
  videoPlaceholder: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: colors.backgroundLight,
  },
  streamUrl: {
    marginTop: spacing.md,
    fontSize: 10,
    color: colors.textMuted,
  },
  streamStats: {
    marginTop: spacing.sm,
    flexDirection: 'row',
  },
  statText: {
    fontSize: 11,
    color: colors.secondary,
  },
  overlay: {
    position: 'absolute',
    top: spacing.sm,
    left: spacing.sm,
    right: spacing.sm,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  overlayLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.overlay,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: 4,
  },
  statusIndicator: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 6,
  },
  liveText: {
    fontSize: 11,
    fontWeight: 'bold',
    color: colors.live,
  },
  overlayRight: {
    flexDirection: 'row',
  },
  recordingBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.overlay,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: 4,
  },
  recordingText: {
    fontSize: 10,
    fontWeight: 'bold',
    color: colors.recording,
    marginLeft: 4,
  },
  bottomOverlay: {
    position: 'absolute',
    bottom: spacing.sm,
    left: spacing.sm,
    right: spacing.sm,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  timestamp: {
    fontSize: 11,
    color: colors.text,
    backgroundColor: colors.overlay,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: 4,
  },
  qualitySelector: {
    flexDirection: 'row',
    backgroundColor: colors.overlay,
    borderRadius: 4,
    overflow: 'hidden',
  },
  qualityButton: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
  },
  qualityButtonActive: {
    backgroundColor: colors.secondary,
  },
  qualityText: {
    fontSize: 10,
    color: colors.textMuted,
  },
  qualityTextActive: {
    color: colors.text,
    fontWeight: '600',
  },
  exitFullscreen: {
    position: 'absolute',
    top: 50,
    right: 20,
    backgroundColor: colors.overlay,
    padding: spacing.sm,
    borderRadius: 8,
  },
});

export default VideoPlayer;