const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const env = process.env;

function getOptionalEnv(name) {
  const value = env[name];
  return value && value.trim() ? value.trim() : '';
}

function requireEnv(name) {
  const value = getOptionalEnv(name);

  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }

  return value;
}

function requireAnyEnv(names, message) {
  for (const name of names) {
    const value = getOptionalEnv(name);
    if (value) {
      return value;
    }
  }

  throw new Error(message);
}

function resolveWorkspacePath(targetPath) {
  if (!targetPath) {
    return '';
  }

  if (path.isAbsolute(targetPath)) {
    return targetPath;
  }

  return path.resolve(env.GITHUB_WORKSPACE || process.cwd(), targetPath);
}

function runCommand(command, args, opts = {}) {
  console.log(`\n> ${command} ${args.join(' ')}`);
  execFileSync(command, args, { stdio: 'inherit', ...opts });
}

function runComposer(args, opts = {}) {
  runCommand('composer', args, opts);
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function writeJson(filePath, value) {
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 4)}\n`);
}

function parseRepositoryEntries(rawRepositories) {
  return (rawRepositories || '')
    .split('\n')
    .map((line) => line.replace(/^-\s*/, '').trim())
    .filter((line) => line.length > 0 && !line.startsWith('#'));
}

function splitRepositoryMapping(entry) {
  const equalsIndex = entry.indexOf('=');
  if (equalsIndex > 0) {
    return [entry.slice(0, equalsIndex).trim(), entry.slice(equalsIndex + 1).trim()];
  }

  const schemeIndex = entry.indexOf('://');
  const colonIndex = entry.indexOf(':');
  if (colonIndex > 0 && (schemeIndex === -1 || colonIndex < schemeIndex)) {
    return [entry.slice(0, colonIndex).trim(), entry.slice(colonIndex + 1).trim()];
  }

  return [null, null];
}

function buildExtraRepository(entry, defaultOrg) {
  const [rawName, mappedUrl] = splitRepositoryMapping(entry);

  if (rawName && mappedUrl) {
    const repositoryName = rawName.includes('/') ? rawName.split('/')[1] : rawName;
    const isComposerRepository = /^https?:\/\//.test(mappedUrl) && !mappedUrl.endsWith('.git');

    return {
      name: repositoryName,
      config: isComposerRepository
        ? { type: 'composer', url: mappedUrl, canonical: false }
        : { type: 'vcs', url: mappedUrl, 'no-api': true, canonical: false }
    };
  }

  const [org, repositoryName] = entry.includes('/') ? entry.split('/', 2) : [defaultOrg, entry];
  if (!org || !repositoryName) {
    throw new Error(`Invalid composer repository entry: ${entry}`);
  }

  return {
    name: repositoryName,
    config: {
      type: 'vcs',
      url: `git@github.com:${org}/${repositoryName}.git`,
      'no-api': true,
      canonical: false
    }
  };
}

function setComposerRepository(projectPath, name, config) {
  console.log(`Adding repository: ${name}`);
  runComposer(['config', `repositories.${name}`, JSON.stringify(config)], { cwd: projectPath });
}

function setInstallerPath(projectPath, drupalModuleDir, composerPackageName) {
  const composerJsonPath = path.join(projectPath, 'composer.json');
  const composerJson = readJson(composerJsonPath);
  const vendor = composerPackageName.split('/')[0];
  const installerPath = `${drupalModuleDir}/{$name}`;
  const vendorMatcher = `vendor:${vendor}`;
  const installerPaths = composerJson.extra?.['installer-paths'] || {};
  const existingMatchers = Array.isArray(installerPaths[installerPath])
    ? installerPaths[installerPath]
    : [];
  const mergedMatchers = existingMatchers.includes(vendorMatcher)
    ? existingMatchers
    : [vendorMatcher, ...existingMatchers];

  composerJson.extra = composerJson.extra || {};
  composerJson.extra['installer-paths'] = {
    [installerPath]: mergedMatchers,
    ...Object.fromEntries(
      Object.entries(installerPaths).filter(([configuredPath]) => configuredPath !== installerPath)
    )
  };

  writeJson(composerJsonPath, composerJson);
}

const drupalVersion = requireEnv('DRUPAL_VERSION');
const projectPath = resolveWorkspacePath(requireEnv('DRUPAL_PROJECT_DIR'));
const drupalModuleDir = requireEnv('DRUPAL_CUSTOM_MODULE_DIR');
const repositoryName = requireEnv('CUSTOM_MODULE_REPOSITORY_NAME');
const repositoryRef = requireEnv('CUSTOM_MODULE_REPOSITORY_REF');
const repositoryOrg = getOptionalEnv('CUSTOM_MODULE_REPOSITORY_ORG');
const workingDirectory = resolveWorkspacePath(getOptionalEnv('CUSTOM_MODULE_WORKING_DIRECTORY'));
const drupalModuleName = requireAnyEnv(
  ['DRUPAL_MODULE_NAME', 'CUSTOM_MODULE_NAME'],
  'Missing Drupal module name. Provide drupal_module_name or the legacy module_name input.'
);
const drupalModulePath = getOptionalEnv('DRUPAL_MODULE_PATH') || drupalModuleName;
const composerPackageName = getOptionalEnv('COMPOSER_PACKAGE_NAME') || (() => {
  const composerVendor = getOptionalEnv('CUSTOM_MODULE_VENDOR');
  if (!composerVendor) {
    throw new Error('Missing Composer package name. Provide composer_package_name or module_vendor.');
  }

  const legacyPackageSuffix = (getOptionalEnv('CUSTOM_MODULE_NAME') || drupalModuleName).replaceAll('_', '-');
  return `${composerVendor}/${legacyPackageSuffix}`;
})();

console.log({
  projectPath,
  drupalModuleDir,
  drupalModuleName,
  drupalModulePath,
  composerPackageName,
  workingDirectory
});

runComposer([
  'create-project',
  `drupal/recommended-project:^${drupalVersion}`,
  projectPath,
  '--no-interaction',
  '--no-install'
]);

const composerGhPat = getOptionalEnv('COMPOSER_GH_PAT');
if (composerGhPat) {
  runComposer(['config', '--global', 'github-oauth.github.com', composerGhPat]);
}

runComposer(['config', 'allow-plugins.tbachert/spi', 'true'], { cwd: projectPath });
runComposer(['config', 'minimum-stability', 'dev'], { cwd: projectPath });
runComposer(['config', 'prefer-stable', 'true'], { cwd: projectPath });
runComposer(['require', '--dev', 'drupal/core-dev', 'drush/drush', 'fakerphp/faker'], { cwd: projectPath });

setComposerRepository(
  projectPath,
  repositoryName,
  workingDirectory
    ? { type: 'path', url: workingDirectory, canonical: true, options: { symlink: false } }
    : {
        type: 'vcs',
        url: `git@github.com:${requireEnv('CUSTOM_MODULE_REPOSITORY_ORG')}/${repositoryName}.git`,
        'no-api': true,
        canonical: true
      }
);

for (const entry of parseRepositoryEntries(env.COMPOSER_REPOSITORIES)) {
  const repository = buildExtraRepository(entry, repositoryOrg);
  setComposerRepository(projectPath, repository.name, repository.config);
}

setInstallerPath(projectPath, drupalModuleDir, composerPackageName);
runComposer(['require', `${composerPackageName}:${repositoryRef}`, '-W'], { cwd: projectPath });
setInstallerPath(projectPath, drupalModuleDir, composerPackageName);
