# Changelog

## 1.3.0 - 2025-09-15
### Added
- Cache com TTL (`cache: 'memory' | 'localStorage' | false`, `cacheTTL`).
- Escopo de formulário (`root`) para auto-map por `data-viacep` apenas dentro do container alvo.
- Suporte a UF em `<select>` (seleciona option correspondente; `addUfIfMissing` para criar se não existir).
- Hook `transform(data, ctx)` para normalizações antes do preenchimento.

## 1.2.0 - 2025-09-09
### Added
- `validateOnBlur` para validar erro de CEP só ao sair do campo (opcional).
- AbortController para cancelar requisições em andamento ao trocar o CEP.
- Timeout configurável (`fetchTimeout`) + retries (`retries`) com backoff (`retryBackoffBase`).
- Fallback de provedor: tenta BrasilAPI se ViaCEP não retornar dados/erro.
- Proteção contra loop no campo CEP (não re-dispacha eventos no próprio CEP).

## 1.1.0
- Máquina de estados e erros estruturados.

## 1.0.0 - inicial
- Primeira versão funcional (máscara, busca, preenchimento e callbacks básicos).