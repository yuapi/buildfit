/**
 * 글자를 클립보드에 복사한다. 되면 true, 안 되면 false — 던지지 않는다 (T-27).
 *
 * 클립보드 API는 늘 있지 않다. 카카오톡 같은 인앱 브라우저·권한 거절·http 주소에서는
 * `navigator.clipboard`가 없거나 거절한다. 그때 조용히 아무것도 하지 않으면 사용자는
 * 복사된 줄 안다. 실패를 돌려주어 화면이 다른 길(직접 선택)을 안내하게 한다.
 */
export async function copyText(
  text: string,
  clipboard: Pick<Clipboard, 'writeText'> | undefined = globalThis.navigator?.clipboard,
): Promise<boolean> {
  if (typeof clipboard?.writeText !== 'function') return false;
  try {
    await clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}
