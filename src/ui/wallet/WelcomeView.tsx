/** F-1: first run with no vault. Nothing is written until creation finishes. */
export function WelcomeView({
  onCreate,
  onImport,
  onSkip,
}: {
  onCreate: () => void;
  onImport: () => void;
  onSkip: () => void;
}) {
  return (
    <section className="wallet-view" data-testid="wallet-welcome">
      <h2>Set up your local wallet</h2>
      <p>
        Create a new Base Sepolia wallet, or import one you already have. Keys are
        encrypted with a password you choose and never leave this browser.
      </p>
      <p className="hint small">
        v1 does not sign transactions. To revoke access or post memories, use the web app.
      </p>
      <div className="wallet-actions">
        <button type="button" data-testid="wallet-create-start" onClick={onCreate}>
          Create a new wallet
        </button>
        <button type="button" data-testid="wallet-import-start" onClick={onImport}>
          Import an existing wallet
        </button>
      </div>
      <p className="hint small">
        Prefer not to set up a wallet? You can still browse any owner address in Timeline.{' '}
        <button type="button" className="link-button" data-testid="wallet-skip" onClick={onSkip}>
          Browse Timeline
        </button>
      </p>
    </section>
  );
}
