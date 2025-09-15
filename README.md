
# 📦 ViaCEP Autofill (v1.3.0)

[![npm version](https://img.shields.io/npm/v/viacep-autofill.svg)](https://www.npmjs.com/package/viacep-autofill) [![License MIT](https://img.shields.io/badge/license-MIT-green.svg)](./LICENSE)

Biblioteca JS “drop-in” para mascarar CEP, consultar provedores públicos e preencher automaticamente endereço (rua, bairro, cidade, UF).

## 🔥 O que há de novo (v1.3.0)
- **Cache com TTL**: `cache: 'memory' | 'localStorage' | false`, com `cacheTTL` configurável.
- **Escopo de formulário**: `root: '#form-endereco'` → auto-map `data-viacep` apenas dentro do form indicado.
- **UF como `<select>`**: seleciona automaticamente a UF; se não existir, pode criar option (`addUfIfMissing: true`).
- **Transformers**: `transform(data, ctx) => data` para normalizar/ajustar antes de preencher (ex.: capitalizar logradouro, remover traço do CEP em hidden).

## ✨ Recursos
- Máscara automática `00000-000` enquanto digita.
- Cache (memória ou localStorage) para evitar chamadas repetidas e respeitar rate-limits.
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
<form id="form-endereco">
  <input id="cep" placeholder="CEP" />
  <input id="rua" data-viacep="logradouro" placeholder="Rua" />
  <input id="bairro" data-viacep="bairro" placeholder="Bairro" />
  <input id="cidade" data-viacep="localidade" placeholder="Cidade" />
  <select id="uf" data-viacep="uf">
    <option value="">UF</option>
    <option>SP</option><option>RJ</option><option>MG</option><option>ES</option>
  </select>
</form>

<script src="/dist/viacep-autofill.global.js"></script>
<script>
  ViaCepAutofill.init({
    root: '#form-endereco',
    cep: '#cep',
    cache: 'localStorage',
    cacheTTL: 300000,        // 5 minutos
    addUfIfMissing: true,
    transform(data) {
      const out = { ...data };
      if (out.logradouro) {
        out.logradouro = out.logradouro
          .replace(/\s+/g, ' ')
          .toLowerCase()
          .replace(/^\w/g, c => c.toUpperCase());
      }
      return out;
    },
    onError: (err) => alert(err.message)
  });
</script>
```

---

## 🧩 API
```js
init({
  root: null,                  // '#form-endereco' → limita auto-map
  cep: '#cep',                 // seletor obrigatório
  autoFormat: true,
  fetchOnLength: 8,
  debounce: 300,
  validateOnBlur: false,

  // saída
  outputsSelector: '[data-viacep]',
  fields: {},
  fillStrategy: 'replace',
  clearOnEmpty: true,
  disableDuringFetch: true,

  // rede
  fetchTimeout: 6000,
  retries: 1,
  retryBackoffBase: 300,
  fallback: true,

  // cache
  cache: 'memory',             // 'memory' | 'localStorage' | false
  cacheTTL: 300000,            // ms

  // helpers
  addUfIfMissing: false,       // cria option se necessário
  transform: null,             // (data, ctx) => data

  // callbacks
  onSuccess: (data, ctx) => {},
  onNotFound: (cep, ctx) => {},
  onError: (err, ctx) => {},
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
│   └── index-advanced.html         # amostra de utilização
├── package.json
├── CHANGELOG.md
└── README.md
```

## 📝 Licença
[MIT](./LICENSE)
