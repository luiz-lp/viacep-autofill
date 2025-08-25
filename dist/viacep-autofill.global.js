/* ViaCEP Autofill — Global v1.0.0 — MIT */
(function (global) {

const DEFAULTS = {
  cep: null,
  fields: {},
  outputsSelector: '[data-viacep]',
  autoFormat: true,
  fetchOnLength: 8,
  debounce: 300,
  clearOnEmpty: true,
  disableDuringFetch: true,
  fillStrategy: 'replace',
  onSuccess: null,
  onNotFound: null,
  onError: null
};

const FIELDS_LIST = [
  'cep','logradouro','complemento','bairro','localidade','uf','ibge','gia','ddd','siafi'
];

function $(sel, root = document) {
  return typeof sel === 'string' ? root.querySelector(sel) : sel;
}

function all(sel, root = document) {
  return Array.from(root.querySelectorAll(sel));
}

function onlyDigits(str) { return (str || '').replace(/\D+/g, ''); }

function formatCep(value) {
  const d = onlyDigits(value).slice(0,8);
  if (d.length <= 5) return d;
  return d.slice(0,5) + '-' + d.slice(5);
}

function setDisabled(el, disabled) {
  if (!el) return;
  try { el.disabled = !!disabled; } catch(e) {}
  if (el.classList && el.classList.toggle) el.classList.toggle('viacep-disabled', !!disabled);
}

function setValue(el, value, strategy='replace') {
  if (!el) return;
  if (strategy === 'append' && el.value) {
    el.value = (el.value + ' ' + (value || '')).trim();
  } else {
    el.value = value || '';
  }
  try {
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  } catch(e) {}
}

function buildAutoMap(root, selector) {
  const map = {};
  all(selector, root).forEach(el => {
    const key = el.getAttribute('data-viacep');
    if (key && FIELDS_LIST.includes(key)) map[key] = el;
  });
  return map;
}

function mergeFieldTargets(manualMap, autoMap) {
  const merged = {};
  FIELDS_LIST.forEach(k => {
    merged[k] = manualMap[k] ? $(manualMap[k]) : (autoMap[k] || null);
  });
  return merged;
}

function fillFields(targets, data, strategy) {
  Object.entries(targets).forEach(([key, el]) => {
    if (!el) return;
    if (key === 'cep') setValue(el, formatCep(data.cep || ''), strategy);
    else setValue(el, data[key] || '', strategy);
  });
}

function clearFields(targets) {
  Object.values(targets).forEach(el => el && setValue(el, ''));
}

function toggleTargets(targets, disabled) {
  Object.values(targets).forEach(el => el && setDisabled(el, disabled));
}

function debounce(fn, wait) {
  let t = null;
  return function (...args) {
    clearTimeout(t);
    t = setTimeout(() => fn.apply(this, args), wait);
  };
}

async function fetchViaCep(cepDigits) {
  const url = `https://viacep.com.br/ws/${cepDigits}/json/`;
  const res = await fetch(url, { method: 'GET', mode: 'cors', headers: { 'Accept': 'application/json' } });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json();
  if (data && data.erro) return null;
  return data;
}

function coreInit(userOptions) {
  const opts = Object.assign({}, DEFAULTS, userOptions || {});
  const cepInput = $(opts.cep);
  if (!cepInput) throw new Error('[ViaCepAutofill] Seletor do CEP inválido ou não encontrado.');

  const autoMap = buildAutoMap(document, opts.outputsSelector);
  const targets = mergeFieldTargets(opts.fields, autoMap);
  targets.cep = targets.cep || cepInput;

  const ctx = { options: opts, cepInput, targets };

  cepInput.addEventListener('input', () => {
    if (opts.autoFormat) cepInput.value = formatCep(cepInput.value);
    const digits = onlyDigits(cepInput.value);
    if (digits.length === 0 && opts.clearOnEmpty) {
      clearFields(targets);
    }
  });

  const debouncedLookup = debounce(async () => {
    const digits = onlyDigits(cepInput.value);
    if (digits.length < opts.fetchOnLength) return;

    try {
      if (opts.disableDuringFetch) toggleTargets(targets, true);
      const data = await fetchViaCep(digits);
      if (!data) {
        if (typeof opts.onNotFound === 'function') opts.onNotFound(digits, ctx);
        return;
      }
      fillFields(targets, data, opts.fillStrategy);
      if (typeof opts.onSuccess === 'function') opts.onSuccess(data, ctx);
    } catch (err) {
      if (typeof opts.onError === 'function') opts.onError(err, ctx);
    } finally {
      if (opts.disableDuringFetch) toggleTargets(targets, false);
    }
  }, opts.debounce);

  ['input','change','blur','paste'].forEach(ev => cepInput.addEventListener(ev, debouncedLookup));

  function lookup(cepValue) {
    const digits = onlyDigits(cepValue);
    return fetchViaCep(digits);
  }

  return { ctx, lookup };
}


  const API = { init: coreInit };
  Object.defineProperty(API, 'version', { value: '1.0.0' });
  global.ViaCepAutofill = API;
})(window);
