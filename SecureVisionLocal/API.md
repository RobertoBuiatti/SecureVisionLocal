# API Reference - SecureVision Local

> Documentação da API REST local do SecureVision Local

## Base URL

```
http://localhost:8080/api
```

**Nota:** O endereço padrão é `localhost:8080`, mas pode ser configurado no app através das configurações.

## Autenticação

O SecureVision Local utiliza autenticação via token Bearer. Para autenticar, inclua o header:

```http
Authorization: Bearer <token>
```

### Configurar Token

```typescript
import { apiClient } from '@services/api';

apiClient.setAuthToken('seu-token-aqui');
```

### Remover Token

```typescript
apiClient.clearAuthToken();
```

---

## Endpoints

### Cameras

#### Listar Câmeras

```http
GET /cameras
```

**Response:**

```json
{
  "cameras": [
    {
      "id": "cam_001",
      "name": "Câmera Frente",
      "ip": "192.168.1.100",
      "port": 554,
      "protocol": "rtsp",
      "type": "ptz",
      "status": "online",
      "hasPTZ": true,
      "presetCount": 8
    }
  ]
}
```

#### Obter Câmera

```http
GET /cameras/:id
```

#### Criar Câmera

```http
POST /cameras
```

**Body:**

```json
{
  "name": "Câmera Entrada",
  "ip": "192.168.1.101",
  "port": 554,
  "protocol": "rtsp",
  "type": "dome",
  "username": "admin",
  "password": "senha123",
  "streamUrl": "rtsp://192.168.1.101:554/stream"
}
```

#### Atualizar Câmera

```http
PUT /cameras/:id
```

#### Deletar Câmera

```http
DELETE /cameras/:id
```

#### Status da Câmera

```http
GET /cameras/:id/status
```

**Response:**

```json
{
  "status": "online",
  "latency": 12,
  "fps": 30,
  "bitrate": 2048
}
```

---

### PTZ (Pan-Tilt-Zoom)

#### Controlar PTZ

```http
POST /cameras/:id/ptz
```

**Body:**

```json
{
  "action": "move",
  "direction": "up",
  "speed": 50
}
```

**Ações disponíveis:**
- `move` - Mover câmera
- `stop` - Parar movimento
- `zoom` - Zoom
- `focus` - Foco automático

**Direções:**
- `up`, `down`, `left`, `right`
- `up-left`, `up-right`, `down-left`, `down-right`

#### Listar Presets

```http
GET /cameras/:id/ptz/presets
```

#### Obter Preset

```http
GET /cameras/:id/ptz/presets/:presetId
```

#### Criar Preset

```http
POST /cameras/:id/ptz/presets
```

**Body:**

```json
{
  "name": "Posição 1",
  "position": {
    "pan": 120,
    "tilt": 45,
    "zoom": 2
  }
}
```

#### Tour PTZ

```http
GET /cameras/:id/ptz/tour
```

---

### Gravações

#### Listar Gravações

```http
GET /recordings
```

**Query Parameters:**

| Parâmetro | Tipo | Descrição |
|-----------|------|-----------|
| `startDate` | string | Data inicial (ISO 8601) |
| `endDate` | string | Data final (ISO 8601) |
| `cameraId` | string | Filtrar por câmera |
| `limit` | number | Limite de resultados (padrão: 50) |
| `offset` | number | Offset para paginação |

#### Obter Gravação

```http
GET /recordings/:id
```

#### Deletar Gravação

```http
DELETE /recordings/:id
```

#### Exportar Gravação

```http
GET /recordings/:id/export
```

**Query Parameters:**

| Parâmetro | Tipo | Descrição |
|-----------|------|-----------|
| `format` | string | Formato: `mp4`, `avi` (padrão: `mp4`) |

#### Buscar Gravações

```http
POST /recordings/search
```

**Body:**

```json
{
  "query": "movimento",
  "startDate": "2024-01-01T00:00:00Z",
  "endDate": "2024-01-31T23:59:59Z",
  "cameras": ["cam_001", "cam_002"],
  "hasMotion": true
}
```

---

### Automação

#### Listar Automações

```http
GET /automation
```

#### Obter Automação

```http
GET /automation/:id
```

#### Criar Automação

```http
POST /automation
```

**Body:**

```json
{
  "name": "Gravação por movimento",
  "trigger": {
    "type": "motion",
    "cameraId": "cam_001",
    "zones": ["porta", "janela"]
  },
  "actions": [
    {
      "type": "startRecording",
      "duration": 60
    },
    {
      "type": "sendNotification",
      "message": "Movimento detectado"
    }
  ],
  "enabled": true
}
```

#### Atualizar Automação

```http
PUT /automation/:id
```

#### Deletar Automação

```http
DELETE /automation/:id
```

#### Disparar Automação

```http
POST /automation/:id/trigger
```

#### Histórico de Automações

```http
GET /automation/history
```

**Query Parameters:**

| Parâmetro | Tipo | Descrição |
|-----------|------|-----------|
| `automationId` | string | Filtrar por automação |
| `limit` | number | Limite de resultados |

---

### Configurações

#### Obter Configurações

```http
GET /settings
```

#### Atualizar Configurações

```http
PUT /settings
```

**Body:**

```json
{
  "theme": "dark",
  "language": "pt-BR",
  "notifications": {
    "enabled": true,
    "motion": true,
    "recording": true,
    "error": true
  },
  "storage": {
    "maxSize": 10737418240,
    "retention": 7,
    "quality": "high"
  },
  "network": {
    "timeout": 30000,
    "retryAttempts": 3
  }
}
```

#### Backup Configurações

```http
POST /settings/backup
```

**Response:**

```json
{
  "backupUrl": "file:///path/to/backup.json",
  "createdAt": "2024-01-15T10:30:00Z"
}
```

#### Restaurar Configurações

```http
POST /settings/restore
```

**Body:**

```json
{
  "backupUrl": "file:///path/to/backup.json"
}
```

---

### Sistema

#### Status do Sistema

```http
GET /system/status
```

**Response:**

```json
{
  "uptime": 86400,
  "cpu": 45,
  "memory": 62,
  "storage": {
    "used": 5368709120,
    "total": 10737418240,
    "recordings": 2147483648
  },
  "cameras": {
    "total": 4,
    "online": 3,
    "offline": 1
  }
}
```

#### Reiniciar Sistema

```http
POST /system/restart
```

#### Logs do Sistema

```http
GET /system/logs
```

**Query Parameters:**

| Parâmetro | Tipo | Descrição |
|-----------|------|-----------|
| `level` | string | `debug`, `info`, `warn`, `error` |
| `limit` | number | Limite de resultados |
| `startDate` | string | Data inicial |

---

## Códigos de Status HTTP

| Código | Descrição |
|--------|-----------|
| 200 | Sucesso |
| 201 | Criado |
| 204 | Sem conteúdo |
| 400 | Bad Request - Parâmetros inválidos |
| 401 | Unauthorized - Token inválido ou ausente |
| 403 | Forbidden - Acesso negado |
| 404 | Not Found - Recurso não encontrado |
| 500 | Internal Server Error - Erro no servidor |
| 503 | Service Unavailable - Serviço indisponível |

---

## Exemplos de Uso

### Listar todas as câmeras

```typescript
import { apiClient, endpoints } from '@services/api';

async function getCameras() {
  try {
    const response = await apiClient.get(endpoints.cameras.list);
    console.log(response.data.cameras);
  } catch (error) {
    console.error('Erro ao buscar câmeras:', error);
  }
}
```

### Criar uma câmera

```typescript
async function createCamera(cameraData: CreateCameraDTO) {
  try {
    const response = await apiClient.post(
      endpoints.cameras.create,
      cameraData
    );
    return response.data;
  } catch (error) {
    console.error('Erro ao criar câmera:', error);
  }
}
```

### Controlar PTZ

```typescript
async function moveCamera(cameraId: string, direction: string) {
  try {
    await apiClient.post(endpoints.cameras.ptz.control(cameraId), {
      action: 'move',
      direction,
      speed: 50
    });
  } catch (error) {
    console.error('Erro ao mover câmera:', error);
  }
}
```

---

## Tipos TypeScript

Os tipos estão disponíveis em `src/shared/types/`:

```typescript
import type {
  Camera,
  Recording,
  Automation,
  Settings,
  PTZPreset,
  PTZTour
} from '@shared/types';
```

---

## Configuração de Timeout

O timeout padrão é de 30 segundos. Para modificar:

```typescript
apiClient.setBaseUrl('http://192.168.1.1:8080/api');
```

Ou através das configurações do app.

---

**Nota:** Esta API é exposta pelo **servidor local do software Windows** (SecureVision Local Desktop) e roda 100% offline na sua rede. Ela é consumida pelo **app mobile companheiro** (Fase B), pelo acesso via navegador na LAN e por integrações externas. O software Windows funciona sem nuvem; o app mobile é apenas um cliente desta API.