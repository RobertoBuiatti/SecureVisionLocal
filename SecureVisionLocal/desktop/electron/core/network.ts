import { networkInterfaces } from 'node:os';

// Adaptadores virtuais que NÃO são a LAN real (WSL, Hyper-V, VirtualBox, etc.).
const VIRTUAL_ADAPTER = /(vEthernet|WSL|Hyper-V|VirtualBox|VMware|Docker|Loopback|Bluetooth|Tailscale|ZeroTier)/i;

interface LanIface {
  name: string;
  address: string; // ex.: 192.168.0.10
}

// Prioriza redes domésticas comuns (192.168.*) e depois 10.*; deixa 172.* por último
// (frequentemente é WSL/Docker).
function rankAddress(addr: string): number {
  if (addr.startsWith('192.168.')) return 0;
  if (addr.startsWith('10.')) return 1;
  return 2;
}

// Interfaces IPv4 reais da LAN (exclui internas, link-local e adaptadores virtuais).
export function getLanInterfaces(): LanIface[] {
  const result: LanIface[] = [];
  const ifaces = networkInterfaces();
  for (const name of Object.keys(ifaces)) {
    if (VIRTUAL_ADAPTER.test(name)) continue;
    for (const net of ifaces[name] ?? []) {
      if (net.family === 'IPv4' && !net.internal && !net.address.startsWith('169.254.')) {
        result.push({ name, address: net.address });
      }
    }
  }
  return result.sort((a, b) => rankAddress(a.address) - rankAddress(b.address));
}

// Endereços IPv4 da LAN real (para montar as URLs de acesso do servidor).
export function getLanIPv4(): string[] {
  return getLanInterfaces().map((i) => i.address);
}

// Sub-redes /24 candidatas para varredura de câmeras (ex.: "192.168.0").
export function getLanSubnets(): string[] {
  const subnets = new Set<string>();
  for (const iface of getLanInterfaces()) {
    const parts = iface.address.split('.');
    if (parts.length === 4) subnets.add(`${parts[0]}.${parts[1]}.${parts[2]}`);
  }
  return Array.from(subnets);
}
