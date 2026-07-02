import { createFileRoute, Link } from "@tanstack/react-router";
import { LegalShell } from "./terms";

export const Route = createFileRoute("/docs")({
  head: () => ({
    meta: [
      { title: "Docs — BloxSmith" },
      { name: "description", content: "Learn how to use BloxSmith: connect the Roblox Studio plugin, build with AI, and send actions to Studio." },
      { property: "og:title", content: "BloxSmith Docs" },
      { property: "og:description", content: "Plugin setup, AI chat, and project workflow." },
          { property: "og:url", content: "https://bloxsmith.pro/docs" },
    ],
    links: [{ rel: "canonical", href: "https://bloxsmith.pro/docs" }],
  }),
  component: () => (
    <LegalShell title="Docs" updated="June 25, 2026">
      <p>Welcome to BloxSmith. This guide walks you through the basics: signing in, creating a project, and connecting the Roblox Studio plugin.</p>

      <h2>1. Create your account</h2>
      <p>Sign in with Google, Apple, or email on the <Link to="/auth" className="text-blue-400 hover:underline">sign-in page</Link>. A profile is created automatically.</p>

      <h2>2. Create a project</h2>
      <p>From the dashboard, click <em>New Project</em>. Give it a name and a game type (obby, tycoon, simulator, RPG, etc.). Each project keeps its own chat history, generated scripts, and plugin queue.</p>

      <h2>3. Install the Roblox Studio plugin</h2>
      <ol className="mt-3 list-decimal space-y-1 pl-5">
        <li>Open the <Link to="/plugin" className="text-blue-400 hover:underline">Plugin page</Link> while signed in.</li>
        <li>Download <code>BloxSmithPlugin.lua</code>.</li>
        <li>In Roblox Studio: <em>Plugins → Plugins Folder</em> and drop the file inside.</li>
        <li>Restart Studio. The BloxSmith panel will appear in the Plugins tab.</li>
        <li>Paste the plugin token shown on the Plugin page and click <em>Connect</em>.</li>
      </ol>

      <h2>4. Build with AI</h2>
      <p>Open your project and type what you want to build. Pick an AI model from the model picker. The AI plans, generates Luau scripts and UI, and queues actions for the plugin.</p>

      <h2>5. Send to Studio</h2>
      <p>When the plugin is connected, queued actions sync to Studio automatically. The plugin reports success or failure back to the project so you can see what landed.</p>

      <h2>Roblox services BloxSmith targets</h2>
      <ul>
        <li><code>Workspace</code> — map objects and models</li>
        <li><code>ServerScriptService</code> — server scripts</li>
        <li><code>StarterGui</code> — UI</li>
        <li><code>StarterPlayerScripts</code> — local scripts</li>
        <li><code>ReplicatedStorage</code> — RemoteEvents, modules, shared assets</li>
        <li><code>ServerStorage</code> — server-only assets</li>
        <li><code>StarterPack</code> — tools</li>
      </ul>

      <h2>Troubleshooting</h2>
      <ul>
        <li><strong>Plugin shows Offline:</strong> open Studio, make sure the panel is visible, paste the latest token from the Plugin page.</li>
        <li><strong>Action failed:</strong> click the action in your project to see the error reported by the plugin.</li>
        <li><strong>AI error:</strong> try a different model from the picker.</li>
      </ul>

      <p className="mt-6">Still stuck? Visit <Link to="/support" className="text-blue-400 hover:underline">Support</Link>.</p>
    </LegalShell>
  ),
});
