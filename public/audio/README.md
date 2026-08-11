# DECK MAYHEM 오디오

게임에서 실제로 사용하는 음원과 재생 시점입니다.

## 반복 배경음

- `bgm-menu.m4a` — 첫 화면·메뉴·커뮤니티
- `bgm-run.m4a` — 스몰·빅 블라인드 일반전
- `bgm-shop.mp3` — 상점
- `bgm-boss.mp3` — 앤티 1~4 보스 블라인드
- `bgm-final-boss.mp3` — 앤티 5 마지막 보스 블라인드

일반전 음원은 WAV의 확장자만 바꾼 파일이 아니라 실제 AAC/M4A로 변환했습니다. 두 보스 음원은 원본 192kbps MP3를 재인코딩하지 않고 사용합니다. 중앙 BGM 매니저는 같은 트랙을 다시 시작하지 않으며, 장면이 바뀌면 550ms 동안 교차 페이드합니다. 최종 보스는 `audioSceneForBossAnte(ante)`가 `final-boss` 장면으로 구분합니다.

## 효과음

- `deck-setup.mp3` — 새 런을 시작해 최초 덱을 세팅할 때
- `card-draw.mp3` — 플레이·버리기 뒤 보충 패와 다음 라운드 패를 뽑을 때
- `card-play.mp3` — 선택한 핸드를 제출하거나 카드를 버릴 때
- `score.mp3` — 카드·조커·UNO 효과의 점수가 계산될 때
- `card-select.m4a` — 손패와 상점 카드를 선택할 때
- `buy.m4a` — 상품 구매·보상 수령·MOD 판매가 확정될 때
- `uno.m4a` — 커뮤니티 UNO를 사용해 핸드를 제출할 때
- `pack-open.m4a` — 부스터 팩 포장을 열 때
- `pack-reveal.m4a` — 팩 카드가 한 장씩 공개될 때
- `win.m4a` — 런 승리 결과가 공개될 때
- `lose.m4a` — 런 패배 결과가 공개될 때

참조되는 16개 파일은 서비스 워커가 설치 시 미리 캐시하므로 설치형 웹앱에서도 오프라인 재생할 수 있습니다. Safari의 구간 재생 요청(`Range`)도 서비스 워커에서 처리합니다. 배경음과 효과음은 각각 독립된 활성화 상태와 음량을 사용합니다.

점수음은 `playScoreTick(step, options)`로 호출할 수 있습니다. 기본값은 단계마다 1.25반음씩 상승하고 동시에 최대 3개까지만 재생합니다. 기존 `playEffect("score")`도 1.2초 안에 이어지는 호출을 자동으로 같은 피치 진행으로 묶습니다.

## 외부 CC0 효과음

다음 효과음은 Kenney의 CC0 팩에서 가져와 AAC/M4A로 변환했습니다.

- UI Audio: `card-select.m4a`
- Casino Audio: `buy.m4a`, `pack-open.m4a`, `pack-reveal.m4a`
- Digital Audio: `uno.m4a`
- Music Jingles: `win.m4a`, `lose.m4a`

원본 라이선스와 출처는 `LICENSE-KENNEY.txt`에 기록합니다.
