# Lumi Assistant on an always-on Mac mini

The Mac mini is the primary Lumi host. It holds the local repositories, assets, browser sessions,
macOS integrations, and native Computer Use permissions. Convex remains the synchronized memory
and state backend, while the stable Cloudflare tunnel receives the Sendblue webhook used by the
paired phone.

## Supported availability

- **Locked Mac:** supported. Lumi's server, tunnel, memory loops, repository sync, and text replies
  continue. Graphical work uses OpenAI Computer Use Locked Use after it is enabled in ChatGPT.
- **Display asleep:** supported. Dedicated host mode prevents idle system sleep but does not keep
  the display lit.
- **Lumi process exits unexpectedly:** supported. The macOS user LaunchAgent restarts the packaged
  app after a short throttle period.
- **Normal app update or intentional Quit:** Lumi stays stopped until it is opened again or the next
  login. A successful intentional exit is not treated as a crash.
- **Full reboot with FileVault:** one manual macOS login is required. This design deliberately does
  not enable automatic login or bypass FileVault. After login, Lumi starts in the background.
- **Power off, actual system sleep, or lost internet:** local processing and phone access pause until
  the Mac is awake, powered, and online again.

## Mac mini setup

1. Install `Lumi Assistant.app` in `/Applications` and open it once.
2. Complete Lumi setup and confirm the Sendblue number and stable Cloudflare tunnel are healthy.
3. In **Settings > Native Mac control**, pair the authorised phone and enable Native Mac control.
4. Enable **Always-on Mac host**.
5. Under **Dedicated Mac mini host**, choose **Install auto-start**.
6. In ChatGPT, install and enable Computer Use, grant Screen Recording and Accessibility, and enable
   Locked Use if locked-screen GUI tasks are required.
7. Keep the mini connected to power and Ethernet or reliable Wi-Fi. Allow display sleep and normal
   locking; do not choose Sleep from the Apple menu.
8. Restart once as a deployment test, log in normally, lock the Mac, and send a harmless test from
   the paired phone such as “Tell me Lumi's host status.” Then test a narrow graphical request.

## Security posture

Host startup is a per-user macOS LaunchAgent. It starts only in that signed-in Aqua session, runs the
packaged Lumi executable, and passes only the `--lumi-host` flag. The phone pairing, Computer Use
approvals, protected-app restrictions, and action confirmations remain enforced. The LaunchAgent
does not expose Codex app-server transports to the public internet.

The default is intentionally the secure option: FileVault remains enabled and someone must perform
the first login after a reboot. Automatic login would materially weaken physical security and is not
configured by Lumi.

## Future outage queue

The stable Sendblue webhook currently terminates on the Mac mini. If the mini is offline, Sendblue
cannot deliver directly to the local server. A later resilience phase can move the public webhook
receiver to a small cloud ingress service that validates and queues messages, while the mini claims
the jobs when it reconnects. That would preserve incoming messages during an outage, but local files,
macOS apps, and Computer Use would still wait for the host to return.
