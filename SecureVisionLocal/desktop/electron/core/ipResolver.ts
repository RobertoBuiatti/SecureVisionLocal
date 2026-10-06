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

// Conecta em host:porta e resolve true se conectou (porta aberta), false caso contrário.
function probeReachable(host: string, port: number, timeoutMs: number): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = createConnection({ host, port });
    let done = false;
    const finish = (ok: boolean): void => {
      if (done) return;
      done = true;
      socket.destroy();
      resolve(ok);
    };
    socket.setTimeout(timeoutMs);
    socket.on('connect', () => finish(true));
    socket.on('timeout', () => finish(false));
    socket.on('error', () => finish(false));
  });
}

function touchTcp(host: string, port: number, timeoutMs: number): Promise<void> {
  return probeReachable(host, port, timeoutMs).then(() => undefined);
}

// Timeout da sonda de cura. Em Wi-Fi ruim o connect TCP da câmera levou até 4,8s (SYN
// retransmitido) nos logs de produção; com 1,5s a cura não enxergava a câmera em NENHUM
// IP e partia para a varredura da sub-rede à toa. As sondas rodam em paralelo, então o
// custo de esperar mais é limitado a uma rodada.
const HEAL_PROBE_TIMEOUT_MS = 5000;

// Dentre vários IPs candidatos (mesmo MAC), devolve o PRIMEIRO que responde na porta
// RTSP, na ORDEM recebida. Essencial quando o ARP tem entradas obsoletas: o MAC pode
// aparecer em 2 IPs (o antigo, já solto pelo DHCP, e o novo), mas só um realmente
// aceita conexão.
async function firstReachable(ips: string[]): Promise<string | null> {
  if (ips.length === 0) return null;
  const checks = await Promise.all(
    ips.map(async (ip) => ({ ip, ok: await probeReachable(ip, 554, HEAL_PROBE_TIMEOUT_MS) })),
  );
  return checks.find((c) => c.ok)?.ip ?? null;
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

// Encontra o IP ATUAL e ACESSÍVEL de um MAC. Junta todos os IPs que casam com o MAC
// na tabela ARP e devolve o que responde na porta RTSP (descarta entradas obsoletas).
// Se nenhum responder, varre a sub-rede para popular o ARP e tenta de novo.
//
// Cura PEGAJOSA: `current` (o host que a câmera usa hoje) é testado em primeiro lugar,
// e só perde a vez se estiver morto. Uma câmera XM com IP fixo de fábrica (.10) E um
// lease DHCP no Wi-Fi responde nos DOIS IPs com o mesmo MAC; sem a preferência, cada
// cura escolhia o IP que respondesse primeiro naquele instante e o app ficava em
// pingue-pongue .10↔.28 a cada ~20s, matando o FFmpeg no meio do handshake toda vez.
export async function findIpForMac(mac: string, current?: string): Promise<string | null> {
  const target = normalizeMac(mac);
  const matches = (table: Map<string, string>): string[] => {
    const ips = Array.from(table.entries())
      .filter(([, m]) => m === target)
      .map(([ip]) => ip);
    // Só prioriza o atual se o ARP ainda o atribui a ESTE MAC: um IP devolvido ao DHCP
    // e entregue a outro dispositivo não pode ganhar a preferência.
    const i = current ? ips.indexOf(current) : -1;
    if (i > 0) ips.unshift(...ips.splice(i, 1));
    return ips;
  };

  const direct = await firstReachable(matches(await readArpTable()));
  if (direct) return direct;

  await sweepToPopulateArp();
  return firstReachable(matches(await readArpTable()));
}
