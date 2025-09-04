// v1.1.0 — State machine + structured errors
const STATES = {
  IDLE:'IDLE',
  TYPING:'TYPING',
  FETCHING:'FETCHING',
  SUCCESS:'SUCCESS',
  NOT_FOUND:'NOT_FOUND',
  ERROR:'ERROR',
  CANCELED:'CANCELED',
  INVALID_CEP:'INVALID_CEP',
  RATE_LIMITED:'RATE_LIMITED'
};

const ERR = {
  INVALID_CEP: 'INVALID_CEP',
  NETWORK: 'NETWORK',
  PROVIDER: 'PROVIDER',
  RATE_LIMITED: 'RATE_LIMITED'
};

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
  onError: null,
  onStateChange: null // (state, payload, ctx)
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

function setValue(el, value, strategy='replace', skipEvents=false) {
  if (!el) return;
  if (strategy === 'append' && el.value) {
    el.value = (el.value + ' ' + (value || '')).trim();
  } else {
    el.value = value || '';
  }
  if (!skipEvents) {
    try {
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
    } catch(e) {}
  }
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
    const skip = (key === 'cep'); // não disparar eventos no próprio CEP
    if (key === 'cep') {
      setValue(el, formatCep(data.cep || ''), strategy, true);
    } else {
      setValue(el, data[key] || '', strategy, skip);
    }
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

function setState(ctx, state, payload) {
  ctx.state = state;
  if (typeof ctx.options.onStateChange === 'function') {
    try { ctx.options.onStateChange(state, payload || {}, ctx); } catch(e) {}
  }
}

async function fetchViaCep(cepDigits) {
  const url = `https://viacep.com.br/ws/${cepDigits}/json/`;
  const res = await fetch(url, { method: 'GET', mode: 'cors', headers: { 'Accept': 'application/json' } });
  if (res.status === 429) {
    throw { code: ERR.RATE_LIMITED, message: 'Too Many Requests', cause: { status: 429 } };
  }
  if (!res.ok) {
    throw { code: ERR.NETWORK, message: `HTTP ${res.status}`, cause: { status: res.status } };
  }
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

  const ctx = { options: opts, cepInput, targets, state: STATES.IDLE };
  setState(ctx, STATES.IDLE);

  cepInput.addEventListener('input', () => {
    if (opts.autoFormat) cepInput.value = formatCep(cepInput.value);
    setState(ctx, STATES.TYPING);
    const digits = onlyDigits(cepInput.value);
    if (digits.length === 0 && opts.clearOnEmpty) {
      clearFields(targets);
      setState(ctx, STATES.IDLE);
    }
  });

  const debouncedLookup = debounce(async () => {
    const digits = onlyDigits(cepInput.value);
    if (digits.length < opts.fetchOnLength) return;

    if (!/^\d{8}$/.test(digits)) {
      setState(ctx, STATES.INVALID_CEP, { digits });
      if (typeof opts.onError === 'function') {
        opts.onError({ code: ERR.INVALID_CEP, message: 'CEP inválido. Use 8 dígitos.' }, ctx);
      }
      return;
    }

    try {
      if (opts.disableDuringFetch) toggleTargets(targets, true);
      setState(ctx, STATES.FETCHING, { digits });
      const data = await fetchViaCep(digits);
      if (!data) {
        setState(ctx, STATES.NOT_FOUND, { digits });
        if (typeof opts.onNotFound === 'function') opts.onNotFound(digits, ctx);
        return;
      }
      fillFields(targets, data, opts.fillStrategy);
      setState(ctx, STATES.SUCCESS, { data });
      if (typeof opts.onSuccess === 'function') opts.onSuccess(data, ctx);
    } catch (err) {
      const shaped = (err && err.code) ? err : { code: ERR.PROVIDER, message: String(err || 'Erro'), cause: err };
      if (shaped.code === ERR.RATE_LIMITED) setState(ctx, STATES.RATE_LIMITED, { error: shaped });
      else setState(ctx, STATES.ERROR, { error: shaped });
      if (typeof opts.onError === 'function') opts.onError(shaped, ctx);
    } finally {
      if (opts.disableDuringFetch) toggleTargets(targets, false);
    }
  }, opts.debounce);

  ['input','change','blur','paste'].forEach(ev => cepInput.addEventListener(ev, debouncedLookup));

  function lookup(cepValue) {
    const digits = onlyDigits(cepValue);
    return fetchViaCep(digits);
  }

  return { ctx, lookup, STATES, ERR };
}
