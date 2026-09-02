# HILIT 랜딩 페이지

브라우저에서 바로 도는 HILIT 소개 페이지입니다. 빌드 도구가 필요 없고
정적 파일만으로 동작합니다.

## 실행

```bash
node serve.mjs
```

또는 Windows 에서 `start-demo.cmd` 를 실행하면 서버가 뜨고 브라우저가 열립니다.

`file://` 로 직접 열면 동작하지 않습니다. 추적 엔진이 ES 모듈과 WASM 을
쓰는데 둘 다 출처(origin)가 필요합니다.

## 구성

```
index.html      페이지 본문
experience.js   스크롤·인터랙션
tokens.css      브랜드 토큰 (민트 #b3edd3 / 잉크 #402a19 — logo/앱-로고.png 실측값)

engine/         추적 엔진. hilit-tracking-poc 의 브라우저 모듈을 그대로 가져왔다
  models.js       NanoTrack · OSNet · NanoDet (onnxruntime-web)
  tracking.js     Tracking Health 7신호 · 20프레임 창 · N-Level
  pipeline.js     4단계 복구
  config.generated.js  shared/config.py 에서 생성된 상수

weights/        ONNX 모델 4개 (약 14MB)
assets/         로고와 자막
tools/          영상에서 프레임을 뽑는 스크립트
```

## 데모 영상은 저장소에 없습니다

`assets/*.mp4` 와 `assets/video-frames/` 는 커밋하지 않습니다.
실제 강습 장면이고 미성년자로 보이는 인원이 담겨 있는데, 이 저장소는
공개입니다. 공개 저장소에 한번 올라간 파일은 git 이력·포크·캐시에 남아
회수가 어렵습니다.

로컬에서 데모를 보려면 아래 경로에 파일을 두세요.

```
assets/hilit-demo.mp4
assets/tracking-debug.mp4
assets/video-frames/frame-005.png
assets/video-frames/frame-040.png
assets/video-frames/frame-080.png
assets/video-frames/frame-120.png
```

프레임은 `tools/extract-video-frames.ps1` 로 영상에서 뽑을 수 있습니다.

파일이 없어도 페이지는 열립니다. 해당 자리만 비어 보입니다.

## 지금 안 쓰이는 assets 파일들 — 의도적으로 남겨 둡니다

`assets/` 안에는 현재 페이지가 불러오지 않는 파일이 넷 있습니다.

| 파일 | 내용 |
| --- | --- |
| `hilit-wordmark-mint.png` · `hilit-wordmark-transparent.png` | 로고 교체 전의 워드마크 |
| `tracking-grid.png` | 추적 관련 이미지 |
| `tracking-debug.vtt` | 위 `tracking-debug.mp4` 와 짝이 되는 자막 |

**정리 대상이 아닙니다.** 참조가 없다는 이유로 지우지 마세요.

## 관련 저장소

| 저장소 | 내용 |
| --- | --- |
| [HILit_App](https://github.com/ccw00325-spec/HILit_App) | Android 앱 + 웹 앱 ([hilit.vercel.app](https://hilit.vercel.app)) |
| HIlittracking | 추적 기술 PoC (Cutie · OSNet · NanoTrack · NanoDet) |

## 라이선스 (모델)

| 모델 | 라이선스 |
| --- | --- |
| NanoTrack v2 (SiamTrackers) | Apache-2.0 |
| NanoDet (opencv_zoo) | Apache-2.0 |
| OSNet (deep-person-reid) | MIT |
