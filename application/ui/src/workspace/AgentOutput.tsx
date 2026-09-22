export const AgentOutput = ({
  agent,
  directory,
}: {
  agent: "claude" | "codex"
  directory: string
}): React.JSX.Element => (
  <div className={`agent-transcript agent-${agent}`}>
    <div className="agent-banner">
      <strong>{agent === "claude" ? "✳ Claude Code" : ">_ Codex"}</strong>
      <span className="text-muted">{directory}</span>
    </div>
    {agent === "claude" ? (
      <>
        <p className="agent-request">❯ Add a compact order summary to the checkout page.</p>
        <p>I’ll check the checkout layout and reuse its existing components.</p>
        <div className="agent-tool">
          <p>
            ● <strong>Read</strong> src/checkout/Checkout.tsx
          </p>
          <p className="agent-tool-result">└ Read 128 lines</p>
        </div>
        <div className="agent-tool">
          <p>
            ● <strong>Update</strong> src/checkout/OrderSummary.tsx
          </p>
          <p className="agent-tool-result">└ Added 12 lines, removed 3 lines</p>
          <pre className="agent-diff">
            <span className="text-muted">{'− <div className="order-total">\n'}</span>
            {
              '+ <section aria-label="Order summary">\n+   <OrderItems items={cart.items} />\n+   <OrderTotal amount={cart.total} />\n+ </section>'
            }
          </pre>
        </div>
        <div className="agent-tool">
          <p>
            ● <strong>Bash</strong> pnpm test -- checkout
          </p>
          <p className="agent-tool-result">└ 6 tests passed · 842ms</p>
        </div>
        <p className="agent-answer">
          Added the order summary with item counts and totals. It stacks below the form on smaller
          screens. All checkout tests pass.
        </p>
        <p className="agent-completion">✻ Worked for 38s</p>
      </>
    ) : (
      <>
        <p className="agent-request">› Review the checkout changes for regressions.</p>
        <p>I’ll inspect the diff and check the empty-cart and quantity-update cases.</p>
        <div className="agent-tool">
          <p>
            • <strong>Explored</strong>
          </p>
          <p className="agent-tool-result">└ Read Checkout.tsx, OrderSummary.tsx</p>
          <p className="agent-tool-result">&nbsp; Read checkout.spec.ts</p>
        </div>
        <div className="agent-tool">
          <p>
            • <strong>Ran</strong> git diff --stat
          </p>
          <p className="agent-tool-result">└ 2 files changed, 24 insertions(+), 8 deletions(-)</p>
        </div>
        <div className="agent-tool">
          <p>
            • <strong>Ran</strong> pnpm test -- checkout
          </p>
          <p className="agent-tool-result">└ Test Files 1 passed · Tests 6 passed</p>
        </div>
        <p className="agent-divider">Worked for 24s</p>
        <div className="agent-answer">
          <p>No regressions found in the reviewed changes.</p>
          <p className="text-muted">
            The total updates with quantity changes, and an empty cart disables checkout. Existing
            tests cover both paths.
          </p>
        </div>
      </>
    )}
  </div>
)
