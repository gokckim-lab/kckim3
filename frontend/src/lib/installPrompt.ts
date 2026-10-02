// 크롬/엣지가 "설치 가능" 신호(beforeinstallprompt)를 보내면 저장해 두었다가 [앱 설치] 버튼에서 띄운다.
// 사파리 등 이 신호를 보내지 않는 브라우저나 이미 설치된 경우에는 버튼이 보이지 않는다.
type InstallEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }> };

let deferred: InstallEvent | null = null;
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((l) => l());

window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferred = e as InstallEvent;
  notify();
});
window.addEventListener('appinstalled', () => {
  deferred = null;
  notify();
});

export const canInstall = () => deferred !== null;

export function subscribeInstall(listener: () => void) {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

export async function promptInstall() {
  if (!deferred) return;
  const e = deferred;
  await e.prompt();
  await e.userChoice;
  deferred = null;
  notify();
}
