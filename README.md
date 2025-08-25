
# 📦 ViaCEP Autofill

Biblioteca JavaScript para auto-preenchimento de endereços a partir de CEP, utilizando o serviço público [ViaCEP](https://viacep.com.br/).

## Recursos
- Máscara automática de CEP (`00000-000`).
- Busca automática após digitação de 8 dígitos.
- Mapeamento por atributo `data-viacep` **ou** configuração manual de campos.
- Callbacks: `onSuccess`, `onNotFound`, `onError`.
- Opção para limpar campos ao apagar CEP e desabilitar durante requisições.
- Versões: **Global (drop-in)** e **ES Module**.
- Distribuição via **npm** e **Packagist/Composer**.

---

## Instalação

### Via npm
```bash
npm install viacep-autofill
# ou
yarn add viacep-autofill
```

### CDN (global)
```html
<script src="https://unpkg.com/viacep-autofill/dist/viacep-autofill.global.js"></script>
```

### Import ES Module (CDN)
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
    onNotFound: (cep) => alert('CEP não encontrado: ' + cep)
  });
</script>
```

## Uso com ES Module (local/projeto)
```html
<script type="module">
  import { init } from "/dist/viacep-autofill.module.js";
  init({ cep: '#cep' });
</script>
```

---

## API
```js
init({
  cep: '#cep',                // seletor obrigatório do campo CEP
  fields: { logradouro: '#rua', bairro: '#bairro', localidade: '#cidade', uf: '#uf' },
  outputsSelector: '[data-viacep]',
  autoFormat: true,
  fetchOnLength: 8,
  debounce: 300,
  clearOnEmpty: true,
  disableDuringFetch: true,
  fillStrategy: 'replace',    // ou 'append'
  onSuccess: (data, ctx) => {},
  onNotFound: (cep, ctx) => {},
  onError: (err, ctx) => {}
});
```

---

## Licença
MIT
