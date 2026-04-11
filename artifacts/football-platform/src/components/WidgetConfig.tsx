/**
 * Global API-Sports widget configuration.
 * Mount once in App.tsx — all other widgets on the page inherit these settings.
 * Points widgets at our backend proxy so they serve cached DB data (zero extra API quota).
 */
export function WidgetConfig() {
  const proxyUrl = `${window.location.origin}/api/widget-proxy`;

  return (
    <api-sports-widget
      data-type="config"
      data-key="local-proxy"
      data-sport="football"
      data-url-football={proxyUrl}
      data-theme="SignalTerminal"
      data-lang="en"
      data-show-logos="true"
      data-timezone="Europe/Copenhagen"
    />
  );
}
