
# 📦 ViaCEP Autofill (v1.2.0)

[![npm version](https://img.shields.io/npm/v/viacep-autofill.svg)](https://www.npmjs.com/package/viacep-autofill) [![License MIT](https://img.shields.io/badge/license-MIT-green.svg)](./LICENSE)

Biblioteca JS “drop-in” para mascarar CEP, consultar provedores públicos e preencher automaticamente endereço (rua, bairro, cidade, UF).

## 🔥 O que há de novo (v1.2.0)
- `validateOnBlur`: valide `INVALID_CEP` só ao sair do campo (evita erro piscando enquanto digita).
- `AbortController`: cancela a requisição anterior se o usuário alterar o CEP.
- `fetchTimeout` + `retries` + `retryBackoffBase`: controle de timeout e política de re‑tentativas com backoff exponencial.
- `fallback`: tenta **BrasilAPI** se o **ViaCEP** não retornar.

## ✨ Recursos
- Máscara automática `00000-000` enquanto digita.
- Mapeamento automático por `data-viacep` **ou** manual por `fields`.
- Callbacks: `onSuccess`, `onNotFound`, `onError`, `onStateChange`.
- Estados prontos: `IDLE`, `TYPING`, `FETCHING`, `SUCCESS`, `NOT_FOUND`, `ERROR`, `CANCELED`, `INVALID_CEP`, `RATE_LIMITED`.

---

## 🚀 Instalação
```bash
npm install viacep-autofill
```

CDN (global):
```html
<script src="https://unpkg.com/viacep-autofill/dist/viacep-autofill.global.js"></script>
```

ES Module (CDN):
```html
<script type="module">
  import { init } from "https://unpkg.com/viacep-autofill/dist/viacep-autofill.module.js";
  init({ cep: '#cep' });
</script>
```

---

## ✅ Uso rápido (Global)
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
    validateOnBlur: true,
    fetchTimeout: 6000,
    retries: 2,
    retryBackoffBase: 300,
    fallback: true,
    onStateChange: (state, payload) => console.log('State:', state, payload),
    onError: (err) => {
      const map = {
        INVALID_CEP: 'CEP inválido. Use 8 dígitos.',
        TIMEOUT: 'Tempo de resposta excedido.',
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

## 🧩 API
```js
init({
  // entrada
  cep: '#cep',                   // seletor obrigatório do campo CEP
  autoFormat: true,              // aplica máscara '00000-000'
  fetchOnLength: 8,              // número de dígitos para iniciar busca
  debounce: 300,                 // ms
  validateOnBlur: false,         // valida INVALID_CEP só ao sair do campo

  // saída: automático por data-viacep ou manual por fields
  outputsSelector: '[data-viacep]',
  fields: {                      // opcional: mapeamento manual
    logradouro: '#rua',
    bairro: '#bairro',
    localidade: '#cidade',
    uf: '#uf'
  },
  fillStrategy: 'replace',       // 'replace' | 'append'
  clearOnEmpty: true,
  disableDuringFetch: true,

  // rede
  fetchTimeout: 6000,            // ms
  retries: 1,                    // tentativas extras
  retryBackoffBase: 300,         // ms
  fallback: true,                // tenta BrasilAPI se ViaCEP não retornar

  // callbacks
  onSuccess: (data, ctx) => {},
  onNotFound: (cep, ctx) => {},
  onError: (err, ctx) => {},     // err = { code, message, cause? }
  onStateChange: (state, payload, ctx) => {}
});
```

### Estados disponíveis
`IDLE`, `TYPING`, `FETCHING`, `SUCCESS`, `NOT_FOUND`, `ERROR`, `CANCELED`, `INVALID_CEP`, `RATE_LIMITED`

### Códigos de erro (`err.code`)
`INVALID_CEP`, `TIMEOUT`, `RATE_LIMITED`, `NETWORK`, `PROVIDER`

---

## 📁 Estrutura
```
viacep-autofill/
├── dist/
│   ├── viacep-autofill.global.js   # versão global (window.ViaCepAutofill)
│   └── viacep-autofill.module.js   # versão ES Module (export { init, STATES, ERR })
├── src/
│   └── core.js                     # código principal
├── sample/
│   └── index.html                  # amostra de utilização
├── package.json
├── CHANGELOG.md
└── README.md
```

## 📝 Licença
[MIT](./LICENSE)
