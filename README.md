# popupday (reservation-fe)

대기열 기반 팝업스토어 예약 서비스의 프론트엔드입니다. 예약 오픈 시점에 몰리는 사용자를 대기실에 세우고, 차례가 된 사용자만 입장 토큰을 받아 예약 API에 접근합니다.

- Vite + React 19 (JavaScript), React Router 7, Tailwind 4 (스타일은 대부분 `src/index.css`)
- 이벤트는 하나입니다. ERD에 이벤트 테이블이 없으므로 이벤트 안내 정보는 `src/event.js`에 고정값으로 둡니다.

## 실행

Node.js 20.19 이상(또는 22.12 이상)이 필요합니다.

```bash
git clone https://github.com/TeamAFinalProject/reservation-system-FE.git
cd reservation-system-FE
npm install
cp .env.example .env
npm run dev        # http://localhost:5173
npm run build
npm run lint
npm run format        # Prettier로 전체 정리 (쌍따옴표, 4칸 들여쓰기)
npm run format:check  # 정리가 필요한 파일 확인
```

백엔드 연동 규칙(API 호출, 헤더, 오류 처리, 서버 정책)은 `CLAUDE.md`에 정리되어 있습니다. 커밋, 브랜치, PR 규칙은 팀 협업 컨벤션을 따릅니다.

```dotenv
VITE_USE_MOCK=true               # true: src/mocks가 응답, false: 실제 서버로 fetch
VITE_API_BASE_URL=               # 비우면 같은 도메인의 /api/... 로 요청
VITE_ADMISSION_TTL_SECONDS=300   # 서버가 admissionExpiresAt을 주지 않을 때의 입장 권한 유효 시간
```

배포 시 SPA 경로(`/queue`, `/reservation` 등)로 바로 접근하거나 새로고침해도 `index.html`이 응답되도록 설정해야 합니다. CloudFront라면 403/404 에러 응답을 `/index.html`(200)로 지정하세요. 프론트와 API를 같은 CloudFront 도메인에서 경로(`/api/*`)로 나누면 CORS 설정이 필요 없습니다.

## 화면 흐름

```
/login, /signup
/                     이벤트 안내 → [예약하기]
/queue                대기실 (헤더 없음). 진입 시 대기열 등록, 3초마다 내 앞 대기 인원 조회
/reservation          날짜 → 시간대 선택 → 확정. 상단에 입장 권한 남은 시간, 시간대는 예약 가능/마감만 표시
/reservation/complete 예약 완료
/my                   내 예약 조회, 취소
```

- 대기 중 **새로고침하면 기존 순번을 버리고 맨 뒤로 다시 등록**됩니다 (`reset: true`). 새로고침을 시도하면 브라우저 확인창이 먼저 뜹니다.
- 로그인, 예약 확정, 예약 취소 버튼은 요청 중 연속 클릭을 막습니다.
- **1인 1예약:** 예약 1건에는 시간대 1개, 1명만 담을 수 있고(인원 선택 없음), 확정된 예약이 있으면 다른 시간대도 예약할 수 없습니다. 서버는 대기열 진입에서 409로 막습니다. 이 409는 "다른 브라우저에서 대기 중"과 상태 코드가 같아서, 프론트가 `GET /api/reservations/me`로 확정된 예약이 있는지 확인해 "이미 확정된 예약이 있어요" 안내를 보여줍니다. 예약 화면에서도 같은 확인을 한 번 더 합니다. 이벤트 화면에서 미리 확인하지 않는 이유는 예약 오픈 시점에 대기열을 거치지 않은 조회 요청이 몰리지 않게 하기 위해서입니다.
- 대기 취소 버튼이나 뒤로가기로 대기실을 벗어나면 `DELETE /api/queue`로 대기열에서 빠집니다.
- 입장 권한이 끝나면 "대기열 다시 등록" 화면이 나옵니다. 타이머가 0이 되거나 서버가 410을 주면 "입장 시간이 만료되었어요", 서버가 403(유효하지 않은 토큰)을 주면 "입장 권한이 종료되었어요. 다른 브라우저에서 대기를 시작했거나 입장 시간이 지났어요."를 보여줍니다.
- 유효한 입장 권한이 있는 상태에서 예약하기를 누르면 대기실을 건너뛰고 예약 화면으로 갑니다.
- **동일 브라우저 + 동일 인물:** 대기와 입장 권한은 한 사람당 한 브라우저, 한 탭에만 있습니다.
    - 같은 브라우저의 새 탭에서 대기를 시작하면 새로고침처럼 맨 뒤로 가고, 기존 탭은 `BroadcastChannel` 신호를 받아 "다른 탭에서 대기를 시작했어요"로 종료됩니다. 새 탭에는 확인 창이 없습니다 (확인 창은 다른 브라우저일 때만).
    - 다른 브라우저에서 대기를 시작하면 "다른 브라우저에서 대기 중이에요" 확인 창이 뜨고, 동의하면 기존 브라우저의 대기(또는 입장 권한)를 취소하고 맨 뒤에서 시작합니다. 대기실에 있던 기존 브라우저는 "다른 브라우저에서 대기를 시작했어요"로 종료됩니다. 예약 화면에 있던 기존 브라우저는 서버가 403(유효하지 않은 토큰)을 주므로 "입장 권한이 종료되었어요" 화면이 나옵니다.
    - mock에서는 주소에 `?mockBrowser=B`를 붙인 탭이 다른 브라우저처럼 동작합니다 (예: `http://localhost:5173/?mockBrowser=B`).

## 폴더

- `src/pages`: Auth(로그인/회원가입), Event(이벤트 안내), Waiting(대기실), Reservation(예약, 완료), My(내 예약)
- `src/api/index.js`: 모든 API 호출. 공통 `sendRequest()`가 토큰 헤더, 응답의 `data` 꺼내기, 에러 처리, mock 분기를 담당
- `src/api/storage.js`: 로그인 토큰, 대기 기록, 입장 권한 저장
- `src/api/queueSession.js`: 대기실 진입/이탈과 서버 대기열 등록/삭제를 1:1로 묶음
- `src/api/tabChannel.js`: 같은 브라우저의 다른 탭에 "대기 시작" 신호를 보내고 받음
- `src/mocks/index.js`: 백엔드 없이 동작하는 가짜 서버 (API 명세 형식으로 응답)
- `src/event.js`: 이벤트 안내 정보 (제목, 기간, 장소 등)
- `src/hooks`: useResource(비동기 조회 상태), useCountdown(타이머), format(날짜, 시간 표시)
- `src/components/UI.jsx`: Logo, ResourceStatus(로딩/에러/빈 상태), Modal

## 저장소

| 저장소         | 키                 | 내용                                    |
| -------------- | ------------------ | --------------------------------------- |
| localStorage   | `access-token`     | 로그인 토큰                             |
| sessionStorage | `queue-entry`      | 대기 기록 (새로고침 감지용)             |
| sessionStorage | `admission`        | 입장 토큰과 만료 시각                   |
| sessionStorage | `last-reservation` | 방금 완료한 예약 (완료 화면 새로고침용) |

## API 계약 (팀 API 명세 기준)

공통

- 모든 응답은 `{ success, message, data }` 형식입니다. 프론트는 `sendRequest()`에서 `data`만 꺼내 쓰고, 실패하면 `message`를 화면에 보여줍니다.
- 목록은 `data` 안의 키에 배열로 옵니다 (`dates`, `slots`, `reservations`). 각 `api` 함수가 배열만 꺼내서 화면에 넘깁니다.
- 필드 이름은 camelCase입니다. 날짜는 `YYYY-MM-DD`, 일시는 시간대 없는 `YYYY-MM-DDTHH:mm:ss`입니다. 입장 만료 시각도 같은 형식이라 사용자 PC 시간대로 읽습니다.
- 아래 표에 없는 필드는 응답에 있어도 프론트가 무시합니다.

헤더

| 헤더                                  | 보내는 요청                                                                                    |
| ------------------------------------- | ---------------------------------------------------------------------------------------------- |
| `Authorization: Bearer <accessToken>` | 로그인, 회원가입을 뺀 모든 요청                                                                |
| `X-Browser-Id: <browserId>`           | 명세상 대기열 진입, 상태 조회, 취소. 프론트는 모든 요청에 보내며, 나머지 API에서는 무시해도 됨 |
| `X-Admission-Token: <admissionToken>` | 날짜 조회, 시간대 조회, 예약 확정                                                              |

`browserId`는 브라우저마다 한 번 만들어 localStorage에 저장한 값으로, 같은 브라우저의 탭은 같은 값을 씁니다.

| API                                              | 요청                                                           | 응답 `data`                                                 |
| ------------------------------------------------ | -------------------------------------------------------------- | ----------------------------------------------------------- |
| POST `/api/auth/signup`                          | `{ username, password }` (아이디 최대 50자, 비밀번호 최소 8자) | `null` (201)                                                |
| POST `/api/auth/login`                           | `{ username, password }`                                       | `{ accessToken }`                                           |
| POST `/api/queue/enter`                          | `{ takeover, reset }`                                          | 대기 상태 (아래)                                            |
| GET `/api/queue/status`                          | 없음                                                           | 대기 상태 (아래)                                            |
| DELETE `/api/queue`                              | 없음                                                           | `null`                                                      |
| GET `/api/slots/dates`                           | 없음                                                           | `{ dates: [{ date, isAvailable }] }`                        |
| GET `/api/slots/?date=YYYY-MM-DD`                | 없음                                                           | `{ slots: [{ slotId, startAt, endAt, isAvailable }] }`      |
| POST `/api/reservations`                         | `{ slotId }`                                                   | 예약 (아래, 201)                                            |
| GET `/api/reservations/me`                       | 없음                                                           | `{ reservations: [예약] }`                                  |
| PATCH `/api/reservations/{reservationId}/cancel` | 없음                                                           | `{ reservationId, reservationNumber, status, cancelledAt }` |

대기 상태

```json
{
    "aheadCount": 5,
    "canEnter": false,
    "admissionToken": null,
    "admissionExpiresAt": null
}
```

- `aheadCount`: 내 앞 남은 인원 (0이면 내 차례)
- `canEnter`가 true일 때 `admissionToken`, `admissionExpiresAt`을 함께 줍니다.
- 대기열 진입의 `takeover`는 다른 브라우저의 대기를 이 브라우저로 옮기고, `reset`은 기존 순서를 버리고 맨 뒤로 다시 등록합니다. 프론트는 대기실에 들어올 때마다(새로고침, 새 탭, 화면의 "다시 대기" 모두) `reset: true`를 보냅니다.

예약

```json
{
    "reservationId": 152,
    "reservationNumber": "20261201000152",
    "status": "CONFIRMED",
    "startAt": "2026-12-01T10:00:00",
    "endAt": "2026-12-01T11:00:00",
    "cancelledAt": null
}
```

- 화면에는 `reservationNumber`를 예약 번호로 표시합니다.
- `cancelledAt`은 내 예약 조회에만 있고, 취소한 예약에만 값이 있습니다.

프론트가 분기하는 실패 응답

| 요청                         | 응답      | 프론트 동작                                                                                                                                        |
| ---------------------------- | --------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| POST `/api/queue/enter`      | 409       | 내 예약을 조회해 확정된 예약이 있으면 "이미 확정된 예약이 있어요", 없으면 "다른 브라우저에서 대기 중이에요" 확인 창. 옮기기 후에도 409면 서버 문구 |
| GET `/api/queue/status`      | 404       | "대기 정보가 만료되었어요"                                                                                                                         |
| GET `/api/queue/status`      | 409       | "다른 브라우저에서 대기를 시작했어요"로 종료                                                                                                       |
| 날짜, 시간대 조회, 예약 확정 | 410       | "입장 시간이 만료되었어요"                                                                                                                         |
| 날짜, 시간대 조회, 예약 확정 | 403       | "입장 권한이 종료되었어요. 다른 브라우저에서 대기를 시작했거나 입장 시간이 지났어요."                                                              |
| POST `/api/reservations`     | 404, 409  | 서버 문구를 보여주고 시간대 목록을 다시 조회                                                                                                       |
| 그 외                        | 모든 실패 | 서버 `message`를 그대로 표시                                                                                                                       |

- 실패 응답에 `code`(`QUEUE_IN_OTHER_BROWSER`, `QUEUE_TAKEN_OVER`)가 오면 상태 코드보다 먼저 그 값으로 판단합니다. 현재 명세에는 `code`가 없습니다.

## BE와 확정할 것

1. 실패 응답 형식이 `{ success: false, message }`인지. 대기열 진입 409의 두 경우(다른 브라우저, 이미 예약 있음)를 구분하는 `code`를 줄 수 있는지. 지금은 프론트가 내 예약 조회로 구분합니다.
1. 예약 화면에서 다른 브라우저로 권한이 넘어간 경우를 구분하려면 `code: "QUEUE_TAKEN_OVER"`를 주면 됩니다. 지금은 403이면 두 이유(다른 브라우저, 시간 지남)를 함께 안내합니다.
1. 창을 닫은 대기자 정리: 창을 닫으면 `DELETE /api/queue`가 오지 않으므로, 상태 조회가 끊긴 대기자를 일정 시간 뒤 정리
1. **1인 1예약**(회원당 `CONFIRMED` 예약 1건) 서버 검증과 정원 초과 방지(동시성). 취소한 회원은 다시 예약 가능
1. 시간대 조회 URL은 명세대로 끝에 `/`가 붙은 `/api/slots/`입니다. Spring Boot 3는 끝의 `/`를 자동으로 맞춰주지 않으니 같은 주소로 매핑이 필요합니다.
1. 대기열 진입 명세의 "기타"에 있는 `page_size` 문구는 템플릿에서 남은 것으로 보입니다.
1. 로그인 토큰 만료(401) 시 프론트는 아직 로그인 화면으로 보내지 않습니다 (프론트 개선 예정).

## mock 동작

- 아무 아이디와 8자 이상 비밀번호로 로그인할 수 있습니다. 회원가입한 아이디는 그 비밀번호로만 로그인됩니다.
- 대기열은 내 앞 8명에서 시작해 3초마다 1명씩 줄어 약 24초 후 입장합니다.
- 내일부터 7일 중 4번째 날은 전체 마감, 매일 13시와 16시 시간대는 마감입니다.
- 입장 권한을 빨리 만료시켜 보려면 `.env`에 `VITE_ADMISSION_TTL_SECONDS=30`을 설정하세요.
- 명세처럼 실패 응답에 `code`를 넣지 않고 상태 코드로만 구분합니다. 확정된 예약이 있으면 대기열 진입이 409로 막힙니다.
