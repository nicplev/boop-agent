# Native Mac control

Lumi routes explicit Mac-control requests from the paired iMessage sender into a separate Codex turn that exposes only the official OpenAI Computer Use plugin. Lumi no longer tries to reproduce Computer Use with an AppleScript screenshot-and-click loop.

## Mac mini setup

1. Install ChatGPT on the Mac mini and sign in to the Codex account Lumi uses.
2. In ChatGPT, install and enable **Plugins → Computer Use**.
3. In **Settings → Computer Use**, grant Screen Recording and Accessibility to **Codex Computer Use**.
4. Enable **Locked Use**. This installs Apple's scoped authorization component; it is not a general remote-unlock path.
5. Pre-approve only the desktop apps Lumi should be able to operate unattended.
6. Install and start Lumi Assistant, pair the authorised phone, enable **Native Mac control**, and turn on **Always-on Mac host**.

Always-on host mode runs a macOS power assertion while Lumi is active and the Mac is connected to power. It prevents idle system sleep but still allows the displays to sleep and macOS to lock. Each native Computer Use turn also enables Codex's prevent-idle-sleep feature.

## Important boundary

Locked/display-asleep and actual system sleep are different states. Native Locked Use can operate during an active trusted Computer Use turn after the display locks. No local Lumi, Sendblue tunnel, or Codex process can receive or run a new request while the Mac is genuinely asleep or offline. The Mac mini should therefore stay plugged in with Always-on host mode enabled; Wake for network access is useful as recovery, but it is not a replacement for preventing idle sleep.

## Safety model

- Only the locally paired phone fingerprint is accepted.
- Only one native Mac task can run at a time.
- The child Codex turn is read-only outside Computer Use; shell, browser substitutes, apps, image generation, and multi-agent features are disabled.
- Other user-installed plugins and standalone MCP servers are disabled for the child turn without changing the user's normal Codex settings.
- Native app approvals and action-time confirmations remain in force.
- Emergency stop terminates the active native turn.
