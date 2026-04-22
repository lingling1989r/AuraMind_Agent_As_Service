import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import plugin, { pluginDefaults } from '../index.js';

const manifest = JSON.parse(readFileSync(new URL('../openclaw.plugin.json', import.meta.url), 'utf8'));
const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));

assert.equal(manifest.version, pkg.version, 'openclaw.plugin.json version should stay aligned with package.json');
assert.equal(pkg.openclaw?.id, manifest.id, 'package.json should declare the same OpenClaw plugin id as the manifest');
assert.deepEqual(pkg.openclaw?.extensions, ['./index.js'], 'package.json should declare the plugin extension entry');
assert.equal(pkg.main, './index.js', 'package main should point at the formal plugin entry');
assert.equal(plugin.id, manifest.id, 'plugin id should match manifest id');
assert.equal(plugin.kind, manifest.kind, 'plugin kind should match manifest kind');
assert.equal(manifest.requirements.node, '>=20', 'manifest should declare the supported node runtime');
assert.ok(Array.isArray(manifest.setup?.notes) && manifest.setup.notes.length > 0, 'manifest should provide install and wiring notes');
assert.equal(manifest.configSchema.properties.enabled.default, pluginDefaults.enabled, 'enabled schema default should match runtime default');
assert.equal(
  manifest.configSchema.properties.isolationMode.default,
  pluginDefaults.isolationMode,
  'isolationMode schema default should match runtime default',
);
assert.equal(
  manifest.configSchema.properties.sessionStorage.properties.preferWorkspaceLocal.default,
  pluginDefaults.sessionStorage.preferWorkspaceLocal,
  'sessionStorage.preferWorkspaceLocal schema default should match runtime default',
);
assert.equal(
  manifest.configSchema.properties.transcript.properties.enabled.default,
  pluginDefaults.transcript.enabled,
  'transcript.enabled schema default should match runtime default',
);
assert.equal(
  manifest.configSchema.properties.memory.properties.enabled.default,
  pluginDefaults.memory.enabled,
  'memory.enabled schema default should match runtime default',
);

console.log('plugin manifest regression passed');
