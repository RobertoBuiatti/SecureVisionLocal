export function isValidIP(ip: string): boolean {
  const ipv4Regex = /^(\d{1,3}\.){3}\d{1,3}$/;
  const ipv6Regex = /^([0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}$/;

  if (!ipv4Regex.test(ip) && !ipv6Regex.test(ip)) {
    return false;
  }

  if (ipv4Regex.test(ip)) {
    const parts = ip.split('.');
    return parts.every(part => {
      const num = parseInt(part, 10);
      return num >= 0 && num <= 255;
    });
  }

  return true;
}

export function isValidPort(port: number): boolean {
  return Number.isInteger(port) && port >= 1 && port <= 65535;
}

export function isValidURL(url: string): boolean {
  try {
    new URL(url);
    return true;
  } catch {
    return false;
  }
}

export function isValidRTSP(url: string): boolean {
  return url.startsWith('rtsp://');
}

export function isValidStreamURL(url: string): boolean {
  return (
    isValidRTSP(url) ||
    url.startsWith('http://') ||
    url.startsWith('https://') ||
    url.startsWith('rtmp://')
  );
}

export function validateCameraConfig(config: {
  ip?: string;
  port?: number;
  streamUrl?: string;
}): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (config.ip && !isValidIP(config.ip)) {
    errors.push('Endereço IP inválido');
  }

  if (config.port !== undefined && !isValidPort(config.port)) {
    errors.push('Porta inválida (1-65535)');
  }

  if (config.streamUrl && !isValidStreamURL(config.streamUrl)) {
    errors.push('URL de stream inválida');
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

export function sanitizeFilename(filename: string): string {
  return filename.replace(/[^a-zA-Z0-9\-_\.]/g, '_');
}

export function truncateText(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return text.slice(0, maxLength - 3) + '...';
}