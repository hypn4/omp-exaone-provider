# Oh My Pi(OMP)용 K-EXAONE 2.5 플러그인

[English](README.md) | [한국어](README.ko.md)

**omp-exaone-provider**는 [Oh My Pi(OMP)](https://github.com/can1357/oh-my-pi) 코딩 에이전트에서 LG AI Research의 **K-EXAONE 2.5** API를 사용할 수 있게 하는 오픈소스 모델 프로바이더 플러그인입니다. 스트리밍 응답, 추론, 도구 호출을 지원합니다.

[npm 패키지](https://www.npmjs.com/package/omp-exaone-provider) · [최신 GitHub 릴리스](https://github.com/hypn4/omp-exaone-provider/releases/latest)

## GitHub에서 설치 (권장)

Git과 OMP `>=18.18.3 <19`가 필요합니다. OMP `18.18.3`에서 검증했습니다.

```sh
omp plugin install github:hypn4/omp-exaone-provider
omp
```

npm에서도 설치할 수 있습니다.

```sh
omp plugin install npm:omp-exaone-provider
```

설치 후 새 OMP 세션을 시작하고, 로그인한 뒤 모델을 선택합니다.

```text
/login exaone
/model exaone/k-exaone_v2.5
```

API 키는 [EXAONE 플랫폼](https://docs.exaone.ai/en/docs/authentication)에서 발급합니다. OMP는 로그인 입력을 마스킹하고 인증 저장소에 키를 저장합니다.

## 사용법

```sh
omp --model exaone/k-exaone_v2.5 --thinking medium
```

환경변수로도 인증할 수 있습니다.

```sh
export EXAONE_API_KEY="your-api-key"
omp --model exaone/k-exaone_v2.5
```

`/login`으로 저장한 키가 있으면 환경변수보다 우선합니다.

### 지원 모델

| 항목 | 값 |
| --- | --- |
| 모델 | `exaone/k-exaone_v2.5` |
| 입력 | 텍스트 |
| 컨텍스트 | 524,288 토큰 |
| 추론 강도 | `low`, `medium`, `high`, `max` |
| 모델 선택 시 기본 추론 강도 | `max` |

- 추론은 항상 활성화됩니다. OMP의 `off` 설정은 `low`로 처리합니다.
- OMP 18.18.3은 응답당 출력을 추론 포함 64,000 토큰으로 제한합니다. 입력과 출력 예산의 합은 컨텍스트 범위 이내여야 합니다.
- 전체 출력 토큰 사용량은 집계되지만, OMP 18.18.3에서는 추론 토큰의 별도 통계가 표시되지 않을 수 있습니다.
- 비용 메타데이터는 [2026년 11월 9일 발표된 출시 시점의 무료 정책](https://docs.exaone.ai/en/docs/changelog)을 반영합니다.

API의 자세한 내용은 EXAONE의 [모델 명세](https://docs.exaone.ai/en/docs/k-exaone-2.5)와 [에이전트 가이드](https://docs.exaone.ai/en/docs/agent-start)를 참고하세요.

## 업데이트와 제거

설치에 사용한 방식으로 설치 명령을 다시 실행하면 됩니다(GitHub 권장). 제거하려면 다음 명령을 사용합니다.

```sh
omp plugin uninstall omp-exaone-provider
```

## 개발

`package.json`에 고정된 Bun `1.4.4`를 사용합니다.

```sh
bun install --frozen-lockfile
bun run check
omp plugin link .
```

`bun run check`는 EXAONE을 호출하지 않고 타입 검사와 테스트를 실행합니다. OMP가 TypeScript 확장을 직접 로드하므로 별도 빌드는 필요하지 않습니다.

선택적으로 실제 API를 검증하려면 `EXAONE_API_KEY`를 설정하고 실행합니다.

```sh
bun run test:live
```

### 릴리스

변경 사항이 없는 작업 트리에서 Bun으로 버전 커밋과 태그를 만든 뒤 함께 push합니다.

```sh
bun run release:version patch
git push --follow-tags
```

`patch` 대신 `minor`, `major` 또는 명시적인 버전을 사용할 수 있습니다. 이 명령은 검증을 실행하고 패키지 버전을 동기화한 뒤 태그를 생성합니다. 정식 `vX.Y.Z` 태그를 push하면 CI 검증, Trusted Publishing을 통한 npm 게시, GitHub Release 생성이 이어집니다. GitHub와 npm 설치본이 같은 버전을 표시하도록 태그와 커밋된 패키지 버전이 일치해야 합니다.

## 라이선스

[MIT](LICENSE)
