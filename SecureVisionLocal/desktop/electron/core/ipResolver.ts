import { exec } from 'node:child_process';
import { createConnection } from 'node:net';
import { getLanSubnets } from './network';

// Resolve o IP ATUAL de uma câmera pelo seu MAC quando o IP muda (DHCP no WiFi).
// Estratégia 100% local (camada 2): lê a tabela ARP do Windows; se o MAC não estiver
// lá (o SO ainda não falou com o novo IP), faz uma varredura TCP leve na porta RTSP
// da sub-rede para forçar a resolução ARP e então relê a tabela.

// Normaliza MAC para comparação (minúsculo, separadores ':' ).
export function normalizeMac(mac: string): string {
  return mac.trim().toLowerCase().replace(/[-.]/g, ':');
}

// Extrai host/porta de uma URL RTSP (tolerante a credenciais no formato user:pass@
// e a URLs Xiongmai com credenciais no path). Retorna null se não conseguir ler.
export function rtspHostPort(url: string): { host: string; port: number } | null {
  const m = url.match(/^rtsp:\/\/(?:[^@/]*@)?([^:/?#]+)(?::(\d+))?/i);
  if (!m) return null;
  return { host: m[1], port: m[2] ? Number(m[2]) : 554 };
}

// Reescreve APENAS o host de uma URL RTSP, preservando credenciais, porta e path.
export function rewriteRtspHost(url: string, newHost: string): string {
  return url.replace(/^(rtsp:\/\/(?:[^@/]*@)?)([^:/?#]+)/i, `$1${newHost}`);
}

function run(cmd: string): Promise<string> {
  return new Promise((resolve) => {
    exec(cmd, { windowsHide: true, timeout: 8000 }, (_err, stdout) => resolve(stdout || ''));
  });
}

// Lê a tabela ARP do SO e devolve um mapa ip -> mac (normalizado).
async function readArpTable(): Promise<Map<string, string>> {
  const out = await run('arp -a');
  const map = new Map<string, string>();
  // Linhas do Windows: "  192.168.1.9      aa-bb-cc-dd-ee-ff     dynamic"
  const re = /(\d{1,3}(?:\.\d{1,3}){3})\s+([0-9a-fA-F]{2}(?:[-:][0-9a-fA-F]{2}){5})/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(out)) !== null) {
    const mac = normalizeMac(m[2]);
    if (mac === 'ff:ff:ff:ff:ff:ff' || mac.startsWith('01:00:5e')) continue; // broadcast/multicast
    map.set(m[1], mac);
  }
  return map;
}

function touchTcp(host: string, port: number, timeoutMs: number): Promise<void> {
  return new Promise((resolve) => {
    const socket = createConnection({ host, port });
    let done = false;
    const finish = (): void => {
      if (done) return;
      done = true;
      socket.destroy();
      resolve();
    };
    socket.setTimeout(timeoutMs);
    socket.on('connect', finish);
    socket.on('timeout', finish);
    socket.on('error', finish);
  });
}

// Varre a(s) sub-rede(s) local(is) na porta RTSP para popular a tabela ARP com os
// dispositivos vivos (inclusive a câmera no IP novo). Não retorna nada — só provoca ARP.
async function sweepToPopulateArp(): Promise<void> {
  const subnets = getLanSubnets().slice(0, 3);
  const targets: Array<{ host: string }> = [];
  for (const subnet of subnets) {
    for (let i = 1; i <= 254; i++) targets.push({ host: `${subnet}.${i}` });
  }
  const concurrency = 64;
  let index = 0;
  const worker = async (): Promise<void> => {
    while (index < targets.length) {
      const t = targets[index++];
      // eslint-disable-next-line no-await-in-loop
      await touchTcp(t.host, 554, 400);
    }
  };
  await Promise.all(Array.from({ length: concurrency }, () => worker()));
}

// Descobre o MAC de um IP conhecido (após uma conexão bem-sucedida a ele).
export async function getMacForIp(ip: string): Promise<string | null> {
  await touchTcp(ip, 554, 1500); // garante que o ARP do IP esteja resolvido
  const table = await readArpTable();
  return table.get(ip) ?? null;
}

// Encontra o IP ATUAL de um MAC. Tenta a tabela ARP direto; se não achar, varre a
// sub-rede para popular o ARP e tenta de novo.
export async function findIpForMac(mac: string): Promise<string | null> {
  const target = normalizeMac(mac);
  let table = await readArpTable();
  for (const [ip, m] of table) if (m === target) return ip;

  await sweepToPopulateArp();
  table = await readArpTable();
  for (const [ip, m] of table) if (m === target) return ip;
  return null;
}
