# 📦 ViaCEP Autofill (v1.1.0)

[![npm version](https://img.shields.io/npm/v/viacep-autofill.svg)](https://www.npmjs.com/package/viacep-autofill) [![License MIT](https://img.shields.io/badge/license-MIT-green.svg)](./LICENSE)

Biblioteca JavaScript para auto-preenchimento de endereços a partir de CEP, utilizando o serviço público [ViaCEP](https://viacep.com.br/).

## Novidades v1.1.0
- Implementada **estados**: `IDLE`, `TYPING`, `FETCHING`, `SUCCESS`, `NOT_FOUND`, `ERROR`, `CANCELED`, `INVALID_CEP`, `RATE_LIMITED`.
- Erros agora seguem a forma `{ code, message, cause? }`.
- Novo callback opcional: `onStateChange(state, payload, ctx)` para acompanhar transições.

## Recursos
- Máscara automática de CEP (`00000-000`).
- Busca automática após digitação de 8 dígitos.
- Mapeamento por atributo `data-viacep` **ou** configuração manual de campos.
- Callbacks: `onSuccess`, `onNotFound`, `onError`, `onStateChange`.
- Opção para limpar campos ao apagar CEP e desabilitar durante requisições.
- Versões: **Global (drop-in)** e **ES Module**.
- Distribuição via **npm**.

---

## Instalação

### Via npm
```bash
npm install viacep-autofill
```

### CDN (global)
```html
<script src="https://unpkg.com/viacep-autofill/dist/viacep-autofill.global.js"></script>
```

### Import ES Module
```html
<script type="module">
  import { init } from "https://unpkg.com/viacep-autofill/dist/viacep-autofill.module.js";

  init({ cep: '#cep' });
</script>
```

---

## Uso Rápido (versão Global)
```html
<form>
  <input id="cep" placeholder="CEP" />
  <input id="rua" data-viacep="logradouro" placeholder="Rua" />
  <input id="bairro" data-viacep="bairro" placeholder="Bairro" />
  <input id="cidade" data-viacep="localidade" placeholder="Cidade" />
  <input id="uf" data-viacep="uf" maxlength="2" placeholder="UF" />
</form>

<script src="/dist/viacep-autofill.global.js"></script>
<script>
  ViaCepAutofill.init({
    cep: '#cep',

    // acompanha mudanças de estado (bom para spinner, logs, etc.)
    onStateChange: (state, payload) => {
      console.log('Estado atual:', state, payload);
      if (state === 'FETCHING') {
        // aqui você pode ligar um "loading..."
      }
      if (state === 'SUCCESS') {
        // aqui você pode desligar loading e dar highlight nos campos
      }
    },

    // trata erros com mensagens amigáveis
    onError: (err) => {
      const map = {
        INVALID_CEP: 'CEP inválido. Use 8 dígitos.',
        RATE_LIMITED: 'Muitas consultas. Aguarde alguns segundos.',
        NETWORK: 'Falha de rede. Tente novamente.',
        PROVIDER: 'Erro no serviço de CEP. Tente mais tarde.'
      };
      alert(map[err.code] || err.message || 'Erro inesperado');
    }
  });
</script>
```

---

## API
```js
init({
  cep: '#cep',                // seletor obrigatório do campo CEP
  fields: { 
    logradouro: '#rua', 
    bairro: '#bairro', 
    localidade: '#cidade', 
    uf: '#uf' 
  },
  outputsSelector: '[data-viacep]',
  autoFormat: true,
  fetchOnLength: 8,
  debounce: 300,
  clearOnEmpty: true,
  disableDuringFetch: true,
  fillStrategy: 'replace',    // ou 'append'

  // callbacks
  onSuccess: (data, ctx) => {
    console.log('Endereço encontrado:', data);
  },

  onNotFound: (cep, ctx) => {
    alert(`CEP ${cep} não encontrado.`);
  },

  onError: (err, ctx) => {
    const map = {
      INVALID_CEP: 'CEP inválido. Use 8 dígitos.',
      RATE_LIMITED: 'Muitas consultas. Aguarde alguns segundos.',
      NETWORK: 'Falha de rede. Tente novamente.',
      PROVIDER: 'Erro no serviço de CEP. Tente mais tarde.'
    };
    alert(map[err.code] || err.message || 'Erro inesperado');
  },

  onStateChange: (state, payload, ctx) => {
    console.log('Estado atual:', state, payload);
    // exemplo: se quiser exibir um "loading..." quando estiver buscando
    if (state === 'FETCHING') {
      console.log('Buscando informações do CEP...');
    }
  }
});
```

### Estados possíveis
- `IDLE`
- `TYPING`
- `FETCHING`
- `SUCCESS`
- `NOT_FOUND`
- `ERROR`
- `CANCELED`
- `INVALID_CEP`
- `RATE_LIMITED`

---

## Estrutura do repositório
```
viacep-autofill/
├── dist/
│   ├── viacep-autofill.global.js   # versão global (window.ViaCepAutofill)
│   └── viacep-autofill.module.js   # versão ES Module (import { init })
├── src/
│   └── core.js                     # código principal reutilizado
├── sample/
│   └── index.html                  # amostra de utilização
├── package.json
├── CHANGELOG.md
└── README.md
```

---

## Licença
[MIT](./LICENSE)
