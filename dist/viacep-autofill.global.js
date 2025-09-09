/* ViaCEP Autofill — Global v1.2.0 — MIT */
(function (global) {
// v1.2.0 — validateOnBlur + AbortController + timeout/retry/backoff + fallback (BrasilAPI)
// Includes: state machine, structured errors, no re-dispatch on CEP field

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
  cep: null,
  fields: {},
  outputsSelector: '[data-viacep]',
  autoFormat: true,
  fetchOnLength: 8,
  debounce: 300,
  clearOnEmpty: true,
  disableDuringFetch: true,
  fillStrategy: 'replace',
  validateOnBlur: false,     // NEW: só valida/alerta erro ao sair do campo
  fetchTimeout: 6000,        // NEW: ms
  retries: 1,                // NEW: tentativas extras (além da primeira)
  retryBackoffBase: 300,     // NEW: ms multiplicado por (tentativa+1)
  fallback: true,            // NEW: tenta BrasilAPI quando ViaCEP falhar/não achar
  onSuccess: null,
  onNotFound: null,
  onError: null,
  onStateChange: null        // (state, payload, ctx)
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
    const skipEvents = (key === 'cep'); // evita loop no próprio campo CEP
    if (key === 'cep') setValue(el, formatCep(data.cep || ''), strategy, true);
    else setValue(el, data[key] || '', strategy, skipEvents);
  });
}

function clearFields(targets) {
  Object.values(targets).forEach(el => el && setValue(el, '', 'replace', el && el.id === 'cep'));
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
    // se chegou aqui, é porque o status foi 200 → CEP existe
    return {
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
    };
  } catch (e) {
    // se o BrasilAPI respondeu 404, consideramos NOT_FOUND
    if (e.cause && e.cause.status === 404) {
      return { notFound: true };
    }
    throw e; // outros erros continuam sendo erro de rede
  }
}

async function resolveCep(cepDigits, opts, externalSignal) {
  const { timeout = 6000, retries = 1, retryBackoffBase = 300, fallback = true } = opts || {};
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
      if (via?.data) return { provider: 'viacep', data: via.data };
      if (via?.notFound) {
        // CEP não existe — retornar NOT_FOUND sem fallback
        return { provider: 'viacep', data: null };
      }

      // Caso improvável (sem data e sem notFound) — trata como NOT_FOUND
      return { provider: 'viacep', data: null };

    } catch (e) {
      // Erro de rede/timeout/rate-limit no ViaCEP
      lastErr = e;

      // 2) Se permitido, tenta fallback BrasilAPI ainda nesta tentativa
      if (fallback) {
        try {
          const br = await fetchBrasilApi(cepDigits, { timeout, signal: controller.signal });
          if (br?.data) return { provider: 'brasilapi', data: br.data };
          if (br?.notFound) {
            // se BrasilAPI também diz que não existe, é NOT_FOUND
            return { provider: 'brasilapi', data: null };
          }
        } catch (e2) {
          // se fallback também falhar por rede, guardamos o último erro
          lastErr = e2;
        }
      }

      // 3) Retry com backoff (somente se ainda temos tentativas)
      if (attempt === retries) break;
      const delay = retryBackoffBase * (attempt + 1);
      await new Promise(r => setTimeout(r, delay));
      attempt++;
    }
  }

  // Se chegamos aqui: esgotou retry em erro de rede
  throw lastErr || { code: ERR.PROVIDER, message: 'Unknown error' };
}


function coreInit(userOptions) {
  const opts = Object.assign({}, DEFAULTS, userOptions || {});
  const cepInput = $(opts.cep);
  if (!cepInput) throw new Error('[ViaCepAutofill] Seletor do CEP inválido ou não encontrado.');

  const autoMap = buildAutoMap(document, opts.outputsSelector);
  const targets = mergeFieldTargets(opts.fields, autoMap);
  targets.cep = targets.cep || cepInput;

  const ctx = { options: opts, cepInput, targets, state: STATES.IDLE, inflight: null, lastDigits: null };
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
      const { data, provider } = await resolveCep(digits, {
        timeout: opts.fetchTimeout,
        retries: opts.retries,
        retryBackoffBase: opts.retryBackoffBase,
        fallback: opts.fallback
      }, ctx.inflight.signal);

      if (!data) {
        setState(ctx, STATES.NOT_FOUND, { digits, provider });
        if (typeof opts.onNotFound === 'function') opts.onNotFound(digits, ctx);
        return;
      }

      fillFields(targets, data, opts.fillStrategy);
      ctx.lastDigits = digits;
      setState(ctx, STATES.SUCCESS, { data, provider });
      if (typeof opts.onSuccess === 'function') opts.onSuccess(data, ctx);
    } catch (err) {
      const shaped = (err && err.code) ? err : { code: ERR.PROVIDER, message: String(err || 'Erro'), cause: err };
      if (shaped.code === ERR.RATE_LIMITED) setState(ctx, STATES.RATE_LIMITED, { error: shaped });
      else if (shaped.code === ERR.TIMEOUT) setState(ctx, STATES.ERROR, { error: shaped });
      else setState(ctx, STATES.ERROR, { error: shaped });
      if (typeof opts.onError === 'function') opts.onError(shaped, ctx);
    } finally {
      if (opts.disableDuringFetch) toggleTargets(targets, false);
    }
  }, DEFAULTS.debounce);  // ensure default debounce if user passes weird value

  // Gatilhos: input/change/blur/paste (mais robusto),
  // mas INVALID_CEP pode ser silencioso se validateOnBlur=true.
  ['input','change','blur','paste'].forEach(ev => {
    if (ev === 'blur') {
      cepInput.addEventListener('blur', () => {
        // no blur, força validação/busca final
        debouncedLookup();
      });
    } else {
      cepInput.addEventListener(ev, debouncedLookup);
    }
  });

  function lookup(cepValue) {
    const digits = onlyDigits(cepValue);
    // usa o mesmo pipeline (com validação/abort/timeout/etc.)
    cepInput.value = formatCep(digits);
    debouncedLookup();
    return Promise.resolve();
  }

  return { ctx, lookup, STATES, ERR };
}


  const API = { init: coreInit };
  Object.defineProperty(API, 'version', { value: '1.2.0' });
  global.ViaCepAutofill = API;
})(window);
