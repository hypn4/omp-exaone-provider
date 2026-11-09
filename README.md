# omp-exaone-provider

Oh My Pi(OMP)에서 LG AI Research의 **K-EXAONE 2.5**를 사용하는 Provider 확장입니다. OMP의 기본 스트리밍·추론·도구 호출 처리와 인증 저장소를 사용합니다.

## 무엇을 지원하나요?

`exaone/k-exaone_v2.5` 모델을 등록하고, `/login exaone` 또는 `EXAONE_API_KEY`로 인증합니다.

| 항목 | 설정 |
| --- | --- |
| Provider | `exaone` |
| 모델 | `k-exaone_v2.5` |
| API | `https://api.exaone.ai/v1/chat/completions` |
| 입력 | 텍스트 |
| 모델 컨텍스트 / 최대 출력 메타데이터 | 각각 524,288 토큰 |
| OMP 18.18.3의 기본 실제 출력 상한 | 64,000 토큰, 추론 토큰 포함 |
| 추론 강도 | `low`, `medium`, `high`, `max` |
| 모델 선택 시 기본 추론 강도 | `max` |
| 개발·검증 기준 | OMP 18.18.3, Bun 1.4.4 |

도구 호출 인자가 완성된 뒤 OMP가 도구를 실행하고, 결과와 이전 추론 내용을 다음 요청에 전달합니다. 텍스트·추론 델타와 마지막 usage chunk는 OMP의 `openai-completions` 전송 계층이 처리합니다.

## 어떻게 설치하고 시작하나요?

프로젝트 디렉터리에서 다음 명령을 실행합니다. 개발 의존성은 lockfile의 버전으로 설치합니다.

```bash
bun install --frozen-lockfile
bun run check
omp plugin link .
omp login exaone
omp --model exaone/k-exaone_v2.5
```

`omp login exaone`은 입력을 마스킹하며 키를 OMP의 인증 저장소에 저장합니다. 실행 중인 OMP에서는 `/login exaone`과 `/model exaone/k-exaone_v2.5`를 사용할 수 있습니다. 새로 연결한 확장은 OMP를 다시 시작하면 로드됩니다.

환경변수도 사용할 수 있습니다. 프로젝트의 `.env.example`을 `.env`로 복사한 뒤 `EXAONE_API_KEY` 값을 입력하거나, 실행 환경에 변수를 설정합니다. `.env`는 Git에서 제외합니다. 저장된 `/login` 키가 있으면 환경변수보다 우선합니다.

```bash
cp .env.example .env
# .env에서 EXAONE_API_KEY를 설정한 뒤 실행
omp --model exaone/k-exaone_v2.5 --thinking low
```

환경변수가 비어 있으면 해당 fallback을 등록하지 않습니다. OMP가 환경변수 이름 자체를 API 키로 해석하는 상황을 방지하고, 정상적으로 로그인을 요구하기 위해서입니다. 환경변수를 바꾼 경우 OMP를 다시 시작합니다.

`omp plugin link`는 소스 디렉터리를 연결하므로 개발 중 다시 패키징할 필요가 없습니다. 제거하려면 다음 명령을 사용합니다.

```bash
omp plugin uninstall omp-exaone-provider
```

## 왜 OMP의 기본 전송 계층을 사용하나요?

EXAONE는 OpenAI 호환 Chat Completions API를 제공하므로 `registerProvider`의 모델 메타데이터와 호환 옵션으로 연결할 수 있습니다. OMP가 이미 제공하는 SSE 파싱, 취소, 도구 인자 조립, 재시도 처리를 사용해 Provider의 유지보수 범위를 줄였습니다.

| EXAONE 요구사항 | 적용 방법 |
| --- | --- |
| 출력 토큰 필드 | `max_tokens` |
| 시스템 프롬프트 | `system` role |
| 추론 강도 | `reasoning_effort` |
| 이전 assistant 추론 전달 | `reasoning_content` |
| 이전 턴의 추론 보존 | `chat_template_kwargs.preserve_thinking: true` |
| 스트림의 사용량 | `stream_options.include_usage: true` |
| 확인되지 않은 OpenAI 전용 필드 | `store`, `developer` role, tool `strict` 제외 |

`temperature=1.0`, `top_p=0.95`는 EXAONE 서버 기본값입니다. 기본 요청에서는 서버 값을 사용하며 OMP에서 명시한 sampling 옵션을 보존합니다.

인증 키는 OMP가 해석하며, Provider는 별도의 키 저장 파일이나 OAuth 서버를 만들지 않습니다. 로그인 시 키는 저장만 하며 유효성은 첫 API 요청에서 확인합니다.

## 추론 강도와 토큰 제한에서 무엇을 주의해야 하나요?

K-EXAONE 2.5는 추론을 비활성화할 수 없습니다. OMP의 off 요청은 최소 강도인 `low`로 처리합니다. SDK에서 강도를 생략해도 OMP 18.18.3은 `low`로 정규화하며, OMP 모델 선택 화면의 기본값 `max`와 구분해야 합니다.

[API 명세](https://docs.exaone.ai/en/docs/k-exaone-2.5)는 `low/high/max`를, [Agent Start](https://docs.exaone.ai/en/docs/agent-start)는 `low/medium/high/max`를 안내합니다. 이 확장은 Agent Start의 네 단계를 지원합니다. 명세에서 빠진 `medium`도 2026-11-09 실제 API 요청에서 HTTP 200과 정상 응답을 확인했습니다.

입력과 `max_tokens`의 합은 524,288 이하여야 합니다. 모델 메타데이터의 최대 출력은 524,288로 유지하지만 OMP 18.18.3의 호환 전송 계층은 실제 요청 출력을 64,000으로 제한합니다. `maxTokens`를 크게 지정하더라도 이 버전에서는 해당 제한이 적용됩니다. 장문 대화의 컨텍스트 관리는 OMP의 compaction 정책을 따릅니다.

## 어떻게 검증하나요?

일반 검증은 API 키와 네트워크 요청 없이 실행됩니다.

```bash
bun run check
```

타입 검사 후 실제 OMP 전송 코드에 모의 SSE 응답을 주입하여 다음 동작을 검사합니다.

- 바이트 단위로 나뉜 한국어·추론·도구 인자의 복원.
- 도구 호출 응답과 도구 결과를 잇는 두 턴, 이전 추론의 재전송.
- 인증 헤더, 모델 ID, 출력 제한과 호환 필드.
- 추론 강도와 off 처리, 출력 토큰 집계.
- HTTP 오류 설명 보존, 429 재시도, 호출 도중 취소.
- 마스킹된 로그인과 빈 키 거부, 환경변수 누락 처리.

실제 API 검증은 `EXAONE_API_KEY`가 설정된 환경에서 명시적으로 실행합니다. 이 스크립트는 OMP에 저장된 다른 인증 정보를 읽지 않습니다.

```bash
bun run test:live
```

정상 실행은 총 세 번의 요청으로 추론·텍스트 스트리밍, `add(17, 25)` 호출, 도구 결과를 받은 최종 `42` 답변을 확인합니다. 요청마다 최대 8,192 출력 토큰과 120초 제한을 적용합니다. 속도 제한 등 일시적 오류는 OMP가 재시도 헤더를 따르며 각 요청을 최대 세 번까지 시도합니다. 검증 도구는 파일이나 외부 서비스를 변경하지 않습니다.

## 현재 알려진 제한은 무엇인가요?

EXAONE는 추론 사용량을 `usage.reasoning_tokens`에 반환하지만 OMP 18.18.3은 `completion_tokens_details.reasoning_tokens`를 읽습니다. 따라서 **전체 출력 토큰은 정상 집계되지만 추론 토큰의 별도 통계가 표시되지 않을 수 있습니다.** 추론은 이미 `completion_tokens`에 포함되므로 출력에 다시 더하지 않습니다.

[2026-11-09 공식 출시 공지](https://docs.exaone.ai/en/docs/changelog)는 현재 무료 제공이라고 명시합니다. 비용 메타데이터는 이를 기준으로 0을 사용합니다. 요금이 발표되면 `src/provider.ts`의 비용 정보를 갱신해야 합니다.

HTTP 400/401/404/422는 요청·인증·설정을 확인해야 하며, 429 및 일시적 서버 오류는 OMP의 재시도 정책을 따릅니다. EXAONE의 `result_code`와 `description`도 OMP 오류 메시지에 보존됩니다. 이 확장은 별도의 재시도 루프를 추가하지 않습니다.

## 어떤 파일을 수정하면 되나요?

| 파일 | 역할 |
| --- | --- |
| `src/index.ts` | OMP 확장 진입점과 Provider 등록 |
| `src/provider.ts` | 모델·호환 정책과 로그인 입력 |
| `test/provider.test.ts` | 실제 OMP 전송 계층을 사용하는 계약 테스트 |
| `scripts/smoke.ts` | 명시적으로 실행하는 실제 API 검증 |
| `package.json` | OMP 확장 선언, 의존성, 개발 명령 |

OMP가 TypeScript를 직접 로드하므로 별도 빌드 산출물이 필요하지 않습니다. 개발 의존성은 검증한 버전에 고정하며, 호스트 호환 범위는 `>=18.18.3 <19`입니다. 버전을 갱신할 때는 타입 검사와 계약 테스트, 실제 API 검증을 다시 실행합니다.

## 어떤 공식 문서를 기준으로 했나요?

- OMP: [Extensions](https://github.com/can1357/oh-my-pi/blob/main/docs/extensions.md), [Extension loading](https://github.com/can1357/oh-my-pi/blob/main/docs/extension-loading.md), [Provider compat reference](https://github.com/can1357/oh-my-pi/blob/main/docs/provider-compat-reference.md), [Endpoint constraints](https://github.com/can1357/oh-my-pi/blob/main/docs/provider-endpoint-constraints.md).
- EXAONE: [Quick Start](https://docs.exaone.ai/en/docs/quick-start), [Agent Start](https://docs.exaone.ai/en/docs/agent-start), [Authentication](https://docs.exaone.ai/en/docs/authentication), [Error Codes](https://docs.exaone.ai/en/docs/error-codes), [K-EXAONE 2.5](https://docs.exaone.ai/en/docs/k-exaone-2.5), [Models](https://docs.exaone.ai/en/docs/models), [Changelog](https://docs.exaone.ai/en/docs/changelog).
