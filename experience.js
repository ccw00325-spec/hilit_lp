const $ = (selector) => document.querySelector(selector);

const els = {
  stage: $('#demoStage'),
  frame: $('#candidateFrame'),
  layer: $('#candidateLayer'),
  canvas: $('#trackingCanvas'),
  video: $('#playbackVideo'),
  reticle: $('#trackingReticle'),
  badge: $('#stageBadge'),
  mark: $('#statusMark'),
  title: $('#statusTitle'),
  detail: $('#statusDetail'),
  progress: $('#progress'),
  progressBar: $('#progressBar'),
  find: $('#findPeople'),
  start: $('#startTracking'),
  setup: $('#setupActions'),
  playback: $('#playbackControls'),
  toggle: $('#togglePlayback'),
  fullscreen: $('#fullscreenDemo'),
  chooseAgain: $('#chooseAgain'),
  wide: $('#wideMode'),
  focus: $('#focusMode'),
  result: $('#resultLine'),
  error: $('#errorBox'),
  heroVideo: document.querySelector('.hero-video'),
};

let pipeline;
let candidates = [];
let selectedIndex = -1;
let trackingResult;
let viewMode = 'wide';
let animationFrame = 0;
const ctx = els.canvas.getContext('2d');

const palette = () => {
  const styles = getComputedStyle(document.documentElement);
  return {
    accent: styles.getPropertyValue('--color-accent').trim(),
    light: styles.getPropertyValue('--color-light').trim(),
    dark: styles.getPropertyValue('--color-dark').trim(),
    error: styles.getPropertyValue('--color-error').trim(),
    bodyFont: styles.getPropertyValue('--font-body').trim(),
  };
};

function setStatus(step, title, detail) {
  els.mark.textContent = String(step);
  els.title.textContent = title;
  els.detail.textContent = detail;
}

function setProgress(percent = 0, visible = true) {
  els.progress.hidden = !visible;
  const value = Math.max(0, Math.min(100, Number(percent) || 0));
  els.progressBar.style.transform = `scaleX(${value / 100})`;
  els.progress.setAttribute('aria-valuenow', String(value));
  els.progress.setAttribute('role', 'progressbar');
}

function showError(message) {
  els.error.textContent = message;
  els.error.hidden = false;
}

function clearError() {
  els.error.hidden = true;
  els.error.textContent = '';
}

function setButtonLoading(button, loading, label, idleLabel) {
  button.dataset.loading = String(loading);
  button.disabled = loading;
  button.textContent = loading ? label : idleLabel;
}

function handlePipelineProgress(update) {
  if (update.phase === 'models') {
    setStatus(1, '추적 모델을 준비하고 있어요.', '처음 한 번만 약 14MB를 불러옵니다. 이후에는 브라우저 캐시를 사용합니다.');
    return;
  }
  if (update.phase === 'track') {
    setProgress(update.percent, true);
    const fps = Number.isFinite(update.fps) ? update.fps.toFixed(1) : '–';
    setStatus(3, '선택한 사람을 영상 끝까지 따라가는 중입니다.', `${update.percent}% 분석 · 현재 ${fps} 분석 프레임/초`);
  }
}

async function preparePipeline() {
  if (location.protocol === 'file:') {
    throw new Error('실제 추적 체험은 이 폴더의 start-demo.cmd로 페이지를 실행해 주세요. HTML 파일을 직접 열면 보안 정책상 모델 파일을 읽을 수 없습니다.');
  }
  if (!pipeline) {
    const { BrowserPipeline } = await import('./engine/pipeline.js');
    pipeline = new BrowserPipeline({ weightsBase: './weights/', onProgress: handlePipelineProgress });
    const response = await fetch('./assets/hilit-demo.mp4');
    if (!response.ok) throw new Error(`체험 영상을 불러오지 못했습니다. HTTP ${response.status}`);
    const blob = await response.blob();
    await pipeline.openVideo(new File([blob], 'hilit-demo.mp4', { type: 'video/mp4' }));
  }
  return pipeline;
}

function chooseCandidate(index) {
  selectedIndex = index;
  [...els.layer.querySelectorAll('.candidate-btn')].forEach((button, buttonIndex) => {
    button.setAttribute('aria-pressed', String(buttonIndex === index));
  });
  els.start.disabled = false;
  els.start.removeAttribute('data-state');
  const candidate = candidates[index];
  const confidence = Math.round((candidate.score ?? 0) * 100);
  setStatus(2, `${index + 1}번 사람을 선택했어요.`, confidence ? `첫 장면 검출 신뢰도 ${confidence}% · 이제 영상 전체를 따라가 볼 수 있어요.` : '이제 영상 전체를 따라가 볼 수 있어요.');
  els.badge.textContent = `STEP 2 · ${index + 1}번 선택`;
}

function renderCandidates(frameData, found) {
  els.frame.src = frameData;
  els.layer.replaceChildren();
  const meta = pipeline.meta;
  found.forEach((candidate, index) => {
    const box = candidate.box;
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'candidate-btn';
    button.dataset.label = String(index + 1);
    button.setAttribute('aria-label', `${index + 1}번 사람 선택`);
    button.setAttribute('aria-pressed', 'false');
    button.style.left = `${(box.x / meta.width) * 100}%`;
    button.style.top = `${(box.y / meta.height) * 100}%`;
    button.style.width = `${(box.width / meta.width) * 100}%`;
    button.style.height = `${(box.height / meta.height) * 100}%`;
    button.addEventListener('click', () => chooseCandidate(index));
    els.layer.append(button);
  });
}

async function findPeople() {
  clearError();
  setButtonLoading(els.find, true, '모델 불러오는 중', '사람 찾기');
  els.start.disabled = true;
  selectedIndex = -1;
  setProgress(4, true);
  try {
    const activePipeline = await preparePipeline();
    setStatus(1, '첫 장면에서 사람을 찾고 있어요.', 'NanoDet이 영상 속 사람 후보를 검출합니다.');
    const result = await activePipeline.firstFrameCandidates();
    candidates = result.candidates;
    if (!candidates.length) throw new Error('첫 장면에서 사람을 찾지 못했습니다. 잠시 후 다시 시도해 주세요.');
    renderCandidates(result.frame, candidates);
    setProgress(100, false);
    setStatus(2, `${candidates.length}명을 찾았어요.`, '화면의 민트색 박스 중 한 명을 직접 선택해 주세요.');
    els.badge.textContent = 'STEP 2 · 한 사람 선택';
    els.find.dataset.state = 'success';
    els.find.textContent = '사람 다시 찾기';
  } catch (error) {
    setProgress(0, false);
    els.find.dataset.state = 'error';
    showError(error.message || '사람 검출을 시작하지 못했습니다. 네트워크 연결을 확인한 뒤 다시 시도해 주세요.');
    setStatus(1, '사람을 찾지 못했어요.', '안내를 확인한 뒤 다시 시도해 주세요.');
  } finally {
    els.find.dataset.loading = 'false';
    els.find.disabled = false;
    if (els.find.textContent === '모델 불러오는 중') els.find.textContent = '다시 시도';
  }
}

async function waitForVideoFrame() {
  if (els.video.readyState >= 2) return;
  await new Promise((resolve, reject) => {
    els.video.addEventListener('loadeddata', resolve, { once: true });
    els.video.addEventListener('error', () => reject(new Error('결과 재생 영상을 준비하지 못했습니다.')), { once: true });
  });
}

function trajectoryAt(time) {
  if (!trackingResult?.trajectory?.length) return null;
  const index = Math.min(trackingResult.trajectory.length - 1, Math.max(0, Math.round(time * trackingResult.meta.analysisFps)));
  return trackingResult.trajectory[index];
}

function cropForBox(box, videoWidth, videoHeight, outputRatio) {
  const sourceBox = {
    x: box.x / trackingResult.meta.scale,
    y: box.y / trackingResult.meta.scale,
    width: box.width / trackingResult.meta.scale,
    height: box.height / trackingResult.meta.scale,
  };
  let height = Math.min(videoHeight, Math.max(sourceBox.height * 2.8, videoHeight * 0.38));
  let width = height * outputRatio;
  if (width > videoWidth) {
    width = videoWidth;
    height = width / outputRatio;
  }
  const centerX = sourceBox.x + sourceBox.width / 2;
  const centerY = sourceBox.y + sourceBox.height / 2;
  const x = Math.max(0, Math.min(videoWidth - width, centerX - width / 2));
  const y = Math.max(0, Math.min(videoHeight - height, centerY - height / 2));
  return { x, y, width, height, sourceBox };
}

function drawWide(point, colors) {
  const vw = els.video.videoWidth;
  const vh = els.video.videoHeight;
  ctx.drawImage(els.video, 0, 0, vw, vh, 0, 0, els.canvas.width, els.canvas.height);
  const scaleX = els.canvas.width / trackingResult.meta.width;
  const scaleY = els.canvas.height / trackingResult.meta.height;
  const box = point.box;
  ctx.strokeStyle = point.state === 'USER_CONFIRMATION' || point.state === 'TRACKING_LOST' ? colors.error : colors.accent;
  ctx.lineWidth = Math.max(3, els.canvas.width / 360);
  ctx.strokeRect(box.x * scaleX, box.y * scaleY, box.width * scaleX, box.height * scaleY);
  ctx.fillStyle = colors.accent;
  ctx.fillRect(box.x * scaleX, Math.max(0, box.y * scaleY - 26), 78, 26);
  ctx.fillStyle = colors.dark;
  ctx.font = `700 ${Math.max(13, els.canvas.width / 72)}px ${colors.bodyFont}`;
  ctx.fillText('HILIT LOCK', box.x * scaleX + 7, Math.max(18, box.y * scaleY - 7));
}

function drawFocus(point, colors) {
  const outputRatio = els.canvas.width / els.canvas.height;
  const crop = cropForBox(point.box, els.video.videoWidth, els.video.videoHeight, outputRatio);
  ctx.drawImage(els.video, crop.x, crop.y, crop.width, crop.height, 0, 0, els.canvas.width, els.canvas.height);
  ctx.strokeStyle = colors.accent;
  ctx.lineWidth = Math.max(2, els.canvas.width / 480);
  const x = ((crop.sourceBox.x - crop.x) / crop.width) * els.canvas.width;
  const y = ((crop.sourceBox.y - crop.y) / crop.height) * els.canvas.height;
  const width = (crop.sourceBox.width / crop.width) * els.canvas.width;
  const height = (crop.sourceBox.height / crop.height) * els.canvas.height;
  ctx.strokeRect(x, y, width, height);
}

function drawTrackingFrame() {
  if (!trackingResult || els.video.readyState < 2) return;
  const point = trajectoryAt(els.video.currentTime);
  if (!point) return;
  const colors = palette();
  ctx.fillStyle = colors.dark;
  ctx.fillRect(0, 0, els.canvas.width, els.canvas.height);
  if (viewMode === 'focus') drawFocus(point, colors);
  else drawWide(point, colors);
  const health = Number.isFinite(point.health) ? Math.round(point.health * 100) : null;
  els.badge.textContent = health === null ? 'TRACKING · 상태 확인 중' : `TRACKING · HEALTH ${health}`;
}

function renderLoop() {
  drawTrackingFrame();
  if (!els.video.paused && !els.video.ended) animationFrame = requestAnimationFrame(renderLoop);
}

async function beginPlayback(result) {
  trackingResult = result;
  els.frame.hidden = true;
  els.layer.hidden = true;
  els.canvas.hidden = false;
  els.reticle.hidden = true;
  els.setup.hidden = true;
  els.playback.hidden = false;
  els.video.currentTime = 0;
  await waitForVideoFrame();
  drawTrackingFrame();
  const m = result.metrics;
  const elapsed = Number.isFinite(m.analysisSeconds) ? m.analysisSeconds.toFixed(1) : '–';
  els.result.textContent = `${m.frames}프레임 분석 · 재식별 ${m.reidCalls}회 · 다시 찾기 ${m.reacquireOk}/${m.reacquireTried}회 · ${elapsed}초`;
  setStatus(4, '추적이 끝났어요.', '재생하면서 전체 화면과 ‘나에게 집중’ 화면을 바꿔 보세요.');
  els.badge.textContent = 'STEP 4 · 결과 재생';
  els.start.dataset.state = 'success';
  setProgress(100, false);
}

async function startTracking() {
  if (selectedIndex < 0) return;
  clearError();
  setButtonLoading(els.start, true, '추적 분석 중', '이 사람 따라가기');
  els.find.disabled = true;
  els.layer.querySelectorAll('button').forEach((button) => { button.disabled = true; });
  setProgress(0, true);
  els.badge.textContent = 'STEP 3 · 실제 추적 중';
  try {
    const result = await pipeline.track(candidates[selectedIndex].box);
    await beginPlayback(result);
  } catch (error) {
    els.start.dataset.state = 'error';
    showError(error.message || '영상 추적을 완료하지 못했습니다. 다시 시도해 주세요.');
    setStatus(3, '추적을 완료하지 못했어요.', '네트워크와 브라우저 메모리를 확인한 뒤 다시 실행해 주세요.');
  } finally {
    els.start.dataset.loading = 'false';
    els.start.disabled = selectedIndex < 0;
    els.start.textContent = '이 사람 따라가기';
    els.find.disabled = false;
    els.layer.querySelectorAll('button').forEach((button) => { button.disabled = false; });
  }
}

function setViewMode(mode) {
  viewMode = mode;
  els.wide.setAttribute('aria-pressed', String(mode === 'wide'));
  els.focus.setAttribute('aria-pressed', String(mode === 'focus'));
  els.reticle.hidden = true;
  drawTrackingFrame();
}

async function togglePlayback() {
  if (els.video.paused || els.video.ended) {
    if (els.video.ended) els.video.currentTime = 0;
    try {
      await els.video.play();
      els.toggle.textContent = '일시정지';
      cancelAnimationFrame(animationFrame);
      renderLoop();
    } catch {
      showError('브라우저가 재생을 막았습니다. 재생 버튼을 다시 눌러 주세요.');
    }
  } else {
    els.video.pause();
    els.toggle.textContent = '재생';
    cancelAnimationFrame(animationFrame);
    drawTrackingFrame();
  }
}

function chooseAgain() {
  els.video.pause();
  els.video.currentTime = 0;
  cancelAnimationFrame(animationFrame);
  els.playback.hidden = true;
  els.setup.hidden = false;
  els.frame.hidden = false;
  els.layer.hidden = false;
  els.canvas.hidden = true;
  els.toggle.textContent = '재생';
  trackingResult = null;
  setStatus(2, `${candidates.length}명을 찾았어요.`, '다른 민트색 박스를 선택해 주세요.');
  els.badge.textContent = 'STEP 2 · 한 사람 선택';
  selectedIndex = -1;
  els.start.disabled = true;
  els.layer.querySelectorAll('.candidate-btn').forEach((button) => button.setAttribute('aria-pressed', 'false'));
}

async function openFullscreen() {
  try {
    if (!document.fullscreenElement) await els.stage.requestFullscreen();
    else await document.exitFullscreen();
  } catch {
    showError('이 브라우저에서는 전체 화면을 시작할 수 없습니다. 브라우저 설정을 확인해 주세요.');
  }
}

els.find.addEventListener('click', findPeople);
els.start.addEventListener('click', startTracking);
els.toggle.addEventListener('click', togglePlayback);
els.wide.addEventListener('click', () => setViewMode('wide'));
els.focus.addEventListener('click', () => setViewMode('focus'));
els.chooseAgain.addEventListener('click', chooseAgain);
els.fullscreen.addEventListener('click', openFullscreen);
els.video.addEventListener('seeked', drawTrackingFrame);
els.video.addEventListener('ended', () => { els.toggle.textContent = '다시 재생'; cancelAnimationFrame(animationFrame); drawTrackingFrame(); });
document.addEventListener('fullscreenchange', () => { els.fullscreen.textContent = document.fullscreenElement ? '화면 닫기' : '전체 화면'; drawTrackingFrame(); });

// 데이터 절약 모드에서는 영상 대신 정지 이미지를 보여준다.
// 멈춤 버튼이 없어졌으므로 일시정지만 하면 되돌릴 수단이 없다.
if (navigator.connection?.saveData) {
  els.heroVideo.pause();
  els.heroVideo.style.display = 'none';
  document.querySelector('.hero-poster').style.display = 'block';
}
if (location.protocol === 'file:') {
  els.detail.textContent = '실제 추적은 start-demo.cmd로 실행하면 바로 사용할 수 있습니다.';
}
