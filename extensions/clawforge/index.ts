import type { OpenClawPluginApi } from "openclaw/plugin-sdk";
import { register } from "./src/index.js";

const plugin = {
  id: "clawforge",
  name: "ClawForge",
  description:
    "Enterprise governance layer – SSO authentication, tool policy enforcement, skill approval, audit logging, and kill switch.",
  register(api: OpenClawPluginApi) {
    register(api);
  },
};

export default plugin;
