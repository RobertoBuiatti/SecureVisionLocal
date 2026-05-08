# Guia de Contribuição - SecureVision Local

Obrigado pelo seu interesse em contribuir com o SecureVision Local!

## Código de Conduta

Este projeto segue um Código de Conduta para garantir uma experiência acolhedora para todos. Ao participar, você concorda em cumprir este código.

## Como Contribuir

### Tipos de Contribuição

 мы принимаем:

- 🐞 **Report de bugs**
- 💡 **Novas funcionalidades**
- 📝 **Documentação**
- 🎨 **Melhorias de UI/UX**
- ⚡️ **Melhorias de performance**
- 🌐 **Traduções**
- 🔧 **Correções de build**

### Passos para Contribuir

#### 1. Fork o Projeto

Clique no botão "Fork" na página do repositório.

#### 2. Clone seu Fork

```bash
git clone https://github.com/seu-usuario/SecureVisionLocal.git
cd SecureVisionLocal/SecureVisionLocal
```

#### 3. Crie uma Branch

```bash
git checkout -b feat/nome-da-funcionalidade
# ou
git checkout - fix/descricao-do-bug
```

#### 4. Faça suas Alterações

Siga os padrões de código:

| Tipo | Regra |
|------|-------|
| Arquivos | Máximo 500 linhas por arquivo |
| Nomenclatura | PascalCase (componentes), camelCase (funções) |
| Tipos | Sempre use TypeScript, sem `any` |
|Testes|Escreva testes para novas funcionalidades|

#### 5. Commit suas Alterações

```bash
git add .
git commit -m "feat: adiciona nova funcionalidade X"
```

Seguimos [Conventional Commits](https://www.conventionalcommits.org):

```
feat:     Nova funcionalidade
fix:      Correção de bug
docs:     Documentação
style:    Formatação (sem lógica)
refactor:  Refatoração
perf:     Melhoria de performance
test:     Adicionar testes
chore:    Tarefas de manutenção
```

#### 6. Push para seu Fork

```bash
git push origin feat/nome-da-funcionalidade
```

#### 7. Crie um Pull Request

1. Va para seu fork no GitHub
2. Clique em "Compare & pull request"
3. Preencha o template:
   - **Title**: Descrição curta
   - **Body**: Descrição detalhada
   - **Linked Issues**: Issue relacionada (se houver)

### Template de Pull Request

```markdown
## Descrição
[Breve descrição das mudanças]

## Tipo de Mudança
- [ ] Bug fix
- [ ] Nova funcionalidade
- [ ] Breaking change
- [ ] Documentação

## Como Testar
1. Passo 1...
2. Passo 2...
3. Verifique o resultado...

## Checklist
- [ ] Testei locally
- [ ] Tests passaram
- [ ] Lint passaram
- [ ] Documentação atualizada
```

## Padrões de Código

### TypeScript

```typescript
// ✅ Bom
interface Camera {
  id: string;
  name: string;
  status: CameraStatus;
}

// ❌ Mau
interface Camera {
  id: any;
  name: any;
}
```

### Zustand Store

```typescript
// ✅ Bom
interface CameraState {
  cameras: Camera[];
  setCameras: (cameras: Camera[]) => void;
}

// ❌ Mau
const setCameras = (cameras) => {
  // estado global aqui
}
```

### Componentes

```typescript
// ✅ Bom
export function CameraCard({ camera, onPress }: CameraCardProps) {
  return (
    <Pressable onPress={onPress}>
      <Text>{camera.name}</Text>
    </Pressable>
  );
}

// ❌ Mau
export function CameraCard(props) {
  return (
    <div>{props.camera.name}</div>
  );
}
```

### Commits

```bash
# ✅ Bom
git commit -m "feat(camera): adiciona visualização em grid 2x2"
git commit -m "fix(recording): corrige problema de pause"
git commit -m "docs: atualiza README com novas instruções"

// ❌ Mau
git commit -m "update stuff"
git commit -m "fixed it"
```

## Ambiente de Desenvolvimento

### Setup

```bash
npm install
npm start  # Metro
npm run android  # Android
npm run ios  # iOS
```

### Comandos Úteis

```bash
npm run lint    # Verificar lint
npm test       # Executar testes
```

## Reporting Bugs

### Template de Bug Report

```markdown
## Descrição
[Descrição clara e concisa do bug]

## Passos para Reproduzir
1. Vá para '...'
2. Clique em '...'
3. Veja o erro '...'

## Comportamento Esperado
[O que deveria acontecer]

## Screenshots
[Se aplicável, adicione screenshots]

## Ambiente
- Device:
- OS:
- Versão do app:

## Informações Adicionais
[Qualquer informação adicional]
```

## Sugestões de Funcionalidades

### Template

```markdown
## Resumo
[Curto resumo da funcionalidade]

## Motivação
[Por que isso seria útil?]

## Solução Proposta
[Como você imagina que funcione]

## Alternativas Consideradas
[Outras soluções consideradas]

## Informações Adicionais
[Qualquer informação adicional]
```

## Reconhecimento

Contribuidores serão reconhecidos no arquivo README.

---

**Obrigado por contribuir! 🎉**