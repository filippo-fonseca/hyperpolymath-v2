/**
 * Keep ExpoWidgetsTarget MARKETING_VERSION / CURRENT_PROJECT_VERSION in lockstep
 * with the main app. expo-widgets hardcodes MARKETING_VERSION = 1.0 on the
 * extension target, which App Store Connect rejects (parent/extension mismatch).
 *
 * The extension target is identified by its INFOPLIST_FILE. Matching on
 * PRODUCT_BUNDLE_IDENTIFIER or PRODUCT_NAME does not work: the bundle id is the
 * user-configured one (com.example.app.widgets, no "ExpoWidgetsTarget" in it)
 * and PRODUCT_NAME is the unexpanded "$(TARGET_NAME)".
 */
const { withXcodeProject } = require("expo/config-plugins");

const TARGET_INFOPLIST = "ExpoWidgetsTarget/Info.plist";

function unquote(value) {
  if (typeof value !== "string") return "";
  return value.replace(/^"|"$/g, "");
}

function withWidgetMarketingVersion(config) {
  return withXcodeProject(config, (cfg) => {
    const project = cfg.modResults;
    const version = cfg.ios?.version ?? cfg.version ?? "1.0.0";
    const buildNumber = String(
      cfg.ios?.buildNumber ?? cfg.android?.versionCode ?? "1",
    );

    let patched = 0;
    const configurations = project.pbxXCBuildConfigurationSection();
    for (const key of Object.keys(configurations)) {
      const entry = configurations[key];
      if (typeof entry !== "object" || !entry.buildSettings) continue;

      if (unquote(entry.buildSettings.INFOPLIST_FILE) !== TARGET_INFOPLIST) {
        continue;
      }

      entry.buildSettings.MARKETING_VERSION = version;
      entry.buildSettings.CURRENT_PROJECT_VERSION = buildNumber;
      patched += 1;
    }

    // Fail loudly rather than shipping a mismatched extension: this plugin
    // silently matched nothing for several builds and the rejection only
    // surfaced at submit time.
    if (patched === 0) {
      throw new Error(
        `[with-widget-version] No build configuration found with INFOPLIST_FILE "${TARGET_INFOPLIST}". ` +
          `The widget extension would ship with MARKETING_VERSION 1.0 against app version ${version} ` +
          `and be rejected by App Store Connect. Check whether expo-widgets renamed its target.`,
      );
    }

    return cfg;
  });
}

module.exports = withWidgetMarketingVersion;
