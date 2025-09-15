/* ViaCEP Autofill — ES Module v1.3.0 — MIT */
// v1.3.0 — cache + root scoping + UF <select> + transformers
// Includes: state machine, structured errors, validateOnBlur, AbortController, timeout/retry/backoff, fallback (BrasilAPI)

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
  RATE_LIMITED: 'RATE_LIMITED',
  TIMEOUT: 'TIMEOUT'
};

const DEFAULTS = {
  // scope
  root: null,                  // NEW: limita auto-map a um container (ex: '#form-endereco')
  cep: null,
  fields: {},
  outputsSelector: '[data-viacep]',
  autoFormat: true,
  fetchOnLength: 8,
  debounce: 300,
  clearOnEmpty: true,
  disableDuringFetch: true,
  fillStrategy: 'replace',

  // UX
  validateOnBlur: false,

  // network
  fetchTimeout: 6000,
  retries: 1,
  retryBackoffBase: 300,
  fallback: true,

  // cache
  cache: 'memory',             // NEW: 'memory' | 'localStorage' | false
  cacheTTL: 5 * 60 * 1000,     // NEW: 5 min em ms

  // field helpers
  addUfIfMissing: false,       // NEW: adiciona option ao <select> se UF não existir

  // transforms
  transform: null,             // NEW: (data, ctx) => data

  // callbacks
  onSuccess: null,
  onNotFound: null,
  onError: null,
  onStateChange: null
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
    if (el.tagName === 'SELECT') {
      el.value = value || '';
    } else {
      el.value = value || '';
    }
  }
  if (!skipEvents) {
    try {
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
    } catch(e) {}
  }
}

function findRootElement(rootOpt) {
  if (!rootOpt) return document;
  return $(rootOpt) || document;
}

function buildAutoMap(rootEl, selector) {
  const map = {};
  all(selector, rootEl).forEach(el => {
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

function fillUF(el, uf, addIfMissing=false) {
  if (!el) return;
  const val = (uf || '').toUpperCase();
  if (el.tagName !== 'SELECT') {
    setValue(el, val);
    return;
  }
  const options = Array.from(el.options);
  let opt = options.find(o => (o.value || '').toUpperCase() === val) ||
            options.find(o => (o.text || '').toUpperCase() === val);
  if (!opt && addIfMissing && val) {
    opt = new Option(val, val);
    el.add(opt, undefined);
  }
  if (opt) el.value = opt.value;
  try { el.dispatchEvent(new Event('change', { bubbles: true })); } catch(e) {}
}

function fillFields(targets, data, strategy, addUfIfMissing) {
  Object.entries(targets).forEach(([key, el]) => {
    if (!el) return;
    const skipEvents = (key === 'cep'); // evita loop no próprio campo CEP
    if (key === 'cep') {
      setValue(el, formatCep(data.cep || ''), strategy, true);
      return;
    }
    if (key === 'uf') {
      fillUF(el, data.uf || '', addUfIfMissing);
      return;
    }
    setValue(el, data[key] || '', strategy, skipEvents);
  });
}

function clearFields(targets) {
  Object.values(targets).forEach(el => {
    if (!el) return;
    if (el.tagName === 'SELECT') el.value = '';
    else setValue(el, '', 'replace', el && el.id === 'cep');
  });
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

function withTimeout(promise, ms, controller) {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => {
      try { controller && controller.abort(); } catch(e) {}
      reject({ code: ERR.TIMEOUT, message: `Timeout after ${ms}ms` });
    }, ms);
    promise.then(v => { clearTimeout(t); resolve(v); })
           .catch(e => { clearTimeout(t); reject(e); });
  });
}

async function fetchJson(url, { timeout=6000, signal } = {}) {
  const res = await withTimeout(fetch(url, { headers: { 'Accept': 'application/json' }, signal }), timeout);
  if (res.status === 429) throw { code: ERR.RATE_LIMITED, message: 'Too Many Requests', cause: { status: 429 } };
  if (!res.ok) throw { code: ERR.NETWORK, message: `HTTP ${res.status}`, cause: { status: res.status } };
  return res.json();
}

async function fetchViaCep(cepDigits, { timeout, signal } = {}) {
  const data = await fetchJson(`https://viacep.com.br/ws/${cepDigits}/json/`, { timeout, signal });
  if (data && data.erro) return { notFound: true };
  return { data };
}

async function fetchBrasilApi(cepDigits, { timeout, signal } = {}) {
  try {
    const d = await fetchJson(`https://brasilapi.com.br/api/cep/v2/${cepDigits}`, { timeout, signal });
    return {
      data: {
        cep: (d.cep || '').replace(/\D/g, ''),
        logradouro: d.street || '',
        complemento: d.location && d.location.coordinates ? '' : (d.complement || ''),
        bairro: d.neighborhood || '',
        localidade: d.city || '',
        uf: d.state || '',
        ibge: d.city_ibge || d.ibge || '',
        gia: '',
        ddd: d.state_ddd || '',
        siafi: ''
      }
    };
  } catch (e) {
    if (e.cause && e.cause.status === 404) return { notFound: true };
    throw e;
  }
}

// --- Cache helpers ---
const _memCache = new Map(); // key -> { t:number, data:any | null, notFound?:true, provider?:string }
function cacheKey(cepDigits) { return `viacep-autofill:${cepDigits}`; }

function cacheGet(opts, cepDigits) {
  if (!opts.cache) return null;
  const now = Date.now();
  if (opts.cache === 'memory') {
    const item = _memCache.get(cepDigits);
    if (!item) return null;
    if (now - item.t > opts.cacheTTL) { _memCache.delete(cepDigits); return null; }
    return item;
  }
  if (opts.cache === 'localStorage' && typeof localStorage !== 'undefined') {
    try {
      const raw = localStorage.getItem(cacheKey(cepDigits));
      if (!raw) return null;
      const item = JSON.parse(raw);
      if (now - item.t > opts.cacheTTL) { localStorage.removeItem(cacheKey(cepDigits)); return null; }
      return item;
    } catch(e) { return null; }
  }
  return null;
}

function cacheSet(opts, cepDigits, value) {
  if (!opts.cache) return;
  const item = { t: Date.now(), ...value };
  if (opts.cache === 'memory') {
    _memCache.set(cepDigits, item);
  } else if (opts.cache === 'localStorage' && typeof localStorage !== 'undefined') {
    try { localStorage.setItem(cacheKey(cepDigits), JSON.stringify(item)); } catch(e) {}
  }
}

async function resolveCep(cepDigits, opts, externalSignal) {
  const { timeout=6000, retries=1, retryBackoffBase=300, fallback=true } = opts || {};

  // 0) cache
  const cached = cacheGet(opts, cepDigits);
  if (cached) {
    if (cached.notFound) return { provider: cached.provider || 'cache', data: null, fromCache: true };
    return { provider: cached.provider || 'cache', data: cached.data, fromCache: true };
  }

  let attempt = 0;
  let lastErr;

  while (attempt <= retries) {
    const controller = new AbortController();
    if (externalSignal) {
      if (externalSignal.aborted) { controller.abort(); break; }
      externalSignal.addEventListener('abort', () => controller.abort(), { once: true });
    }

    try {
      // 1) ViaCEP
      const via = await fetchViaCep(cepDigits, { timeout, signal: controller.signal });
      if (via?.data) {
        cacheSet(opts, cepDigits, { provider: 'viacep', data: via.data });
        return { provider: 'viacep', data: via.data };
      }
      if (via?.notFound) {
        cacheSet(opts, cepDigits, { provider: 'viacep', notFound: true });
        return { provider: 'viacep', data: null };
      }

      // default: considerar not found
      cacheSet(opts, cepDigits, { provider: 'viacep', notFound: true });
      return { provider: 'viacep', data: null };

    } catch (e) {
      lastErr = e;

      // Se o erro for um abort nativo do fetch
      if (e && e.name === 'AbortError') {
        throw { code: 'CANCELED', message: 'Aborted', cause: e };
      }

      // 2) fallback quando erro de rede/timeouts
      if (fallback) {
        try {
          const br = await fetchBrasilApi(cepDigits, { timeout, signal: controller.signal });
          if (br?.data) {
            cacheSet(opts, cepDigits, { provider: 'brasilapi', data: br.data });
            return { provider: 'brasilapi', data: br.data };
          }
          if (br?.notFound) {
            cacheSet(opts, cepDigits, { provider: 'brasilapi', notFound: true });
            return { provider: 'brasilapi', data: null };
          }
        } catch (e2) {
          lastErr = e2;
        }
      }

      if (attempt === retries) break;
      const delay = retryBackoffBase * (attempt + 1);
      await new Promise(r => setTimeout(r, delay));
      attempt++;
    }
  }

  throw lastErr || { code: ERR.PROVIDER, message: 'Unknown error' };
}

function coreInit(userOptions) {
  const opts = Object.assign({}, DEFAULTS, userOptions || {});
  const rootEl = findRootElement(opts.root);
  const cepInput = $(opts.cep, rootEl);
  if (!cepInput) throw new Error('[ViaCepAutofill] Seletor do CEP inválido ou não encontrado.');

  const autoMap = buildAutoMap(rootEl, opts.outputsSelector);
  const targets = mergeFieldTargets(opts.fields, autoMap);
  targets.cep = targets.cep || cepInput;

  const ctx = { options: opts, rootEl, cepInput, targets, state: STATES.IDLE, inflight: null, lastDigits: null };
  setState(ctx, STATES.IDLE);

  // máscara e limpeza
  cepInput.addEventListener('input', () => {
    if (opts.autoFormat) cepInput.value = formatCep(cepInput.value);
    setState(ctx, STATES.TYPING);
    const digits = onlyDigits(cepInput.value);
    if (digits.length === 0 && opts.clearOnEmpty) {
      clearFields(targets);
      ctx.lastDigits = null;
      setState(ctx, STATES.IDLE);
    }
  });

  const debouncedLookup = debounce(async () => {
    const digits = onlyDigits(cepInput.value);
    if (digits.length < opts.fetchOnLength) return;

    const isTyping = document.activeElement === cepInput;
    // validação de 8 dígitos
    if (!/^\d{8}$/.test(digits)) {
      if (opts.validateOnBlur && isTyping) {
        // silencioso enquanto digita; valida quando sair do campo
        return;
      }
      setState(ctx, STATES.INVALID_CEP, { digits });
      if (typeof opts.onError === 'function') {
        opts.onError({ code: ERR.INVALID_CEP, message: 'CEP inválido. Use 8 dígitos.' }, ctx);
      }
      return;
    }

    // evita refetch do mesmo CEP já resolvido
    if (ctx.lastDigits && ctx.lastDigits === digits && ctx.state === STATES.SUCCESS) return;

    // aborta requisição anterior se houver
    if (ctx.inflight && typeof ctx.inflight.abort === 'function') {
      ctx.inflight.abort();
      setState(ctx, STATES.CANCELED, {});
    }
    ctx.inflight = new AbortController();

    try {
      if (opts.disableDuringFetch) toggleTargets(targets, true);
      setState(ctx, STATES.FETCHING, { digits });
      const result = await resolveCep(digits, {
        timeout: opts.fetchTimeout,
        retries: opts.retries,
        retryBackoffBase: opts.retryBackoffBase,
        fallback: opts.fallback,
        cache: opts.cache,
        cacheTTL: opts.cacheTTL
      }, ctx.inflight.signal);

      let data = result.data;
      if (!data) {
        setState(ctx, STATES.NOT_FOUND, { digits, provider: result.provider, fromCache: result.fromCache });
        if (typeof opts.onNotFound === 'function') opts.onNotFound(digits, ctx);
        return;
      }

      // transformer (permite normalizar/ajustar)
      if (typeof opts.transform === 'function') {
        try { data = opts.transform(data, ctx) || data; } catch(e) {}
      }

      fillFields(targets, data, opts.fillStrategy, opts.addUfIfMissing);
      ctx.lastDigits = digits;
      setState(ctx, STATES.SUCCESS, { data, provider: result.provider, fromCache: result.fromCache });
      if (typeof opts.onSuccess === 'function') opts.onSuccess(data, ctx);
    } catch (err) {

      // Silenciar aborts (quando trocamos de CEP rápido ou blur/input coincidem)
      if (err && (err.name === 'AbortError' || err.code === 'CANCELED')) {
        setState(ctx, STATES.CANCELED, { error: err });
        return; // <- não chama onError
      }

      const shaped = (err && err.code) ? err : { code: ERR.PROVIDER, message: String(err || 'Erro'), cause: err };
      if (shaped.code === ERR.RATE_LIMITED) setState(ctx, STATES.RATE_LIMITED, { error: shaped });
      else if (shaped.code === ERR.TIMEOUT) setState(ctx, STATES.ERROR, { error: shaped });
      else setState(ctx, STATES.ERROR, { error: shaped });
      if (typeof opts.onError === 'function') opts.onError(shaped, ctx);
    } finally {
      if (opts.disableDuringFetch) toggleTargets(targets, false);
    }
  }, opts.debounce);

  // Gatilhos
  ['input','change','blur','paste'].forEach(ev => {
    if (ev === 'blur') {
      cepInput.addEventListener('blur', () => debouncedLookup());
    } else {
      cepInput.addEventListener(ev, debouncedLookup);
    }
  });

  function lookup(cepValue) {
    const digits = onlyDigits(cepValue);
    // usa o mesmo pipeline (com cache/validação/abort/timeout/etc.)
    cepInput.value = formatCep(digits);
    debouncedLookup();
    return Promise.resolve();
  }

  return { ctx, lookup, STATES, ERR };
}

export function init(options) { return coreInit(options); }
export const version = '1.3.0';
export const STATES = STATES;
export const ERR = ERR;
