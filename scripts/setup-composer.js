const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const env = process.env;
const REQUIRED_ENV_VARS = [
  'DRUPAL_VERSION',
  'DRUPAL_PROJECT_DIR',
  'DRUPAL_CUSTOM_MODULE_DIR',
  'CUSTOM_MODULE_NAME',
  'CUSTOM_MODULE_REPOSITORY_NAME',
  'CUSTOM_MODULE_REPOSITORY_REF',
  'CUSTOM_MODULE_VENDOR'
];

function requireEnv(name) {
  const value = env[name];

  if (!value || !value.trim()) {
    throw new Error(`Missing required environment variable: ${name}`);
  }

  return value.trim();
}

function resolvePathFromWorkspace(targetPath) {
  if (!targetPath) {
    return '';
  }

  if (path.isAbsolute(targetPath)) {
    return targetPath;
  }

  const workspacePath = env.GITHUB_WORKSPACE || process.cwd();
  return path.resolve(workspacePath, targetPath);
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

function writeJson(filePath, data) {
  fs.writeFileSync(filePath, `${JSON.stringify(data, null, 4)}\n`);
}

function setInstallerPath(composerJsonPath) {
  const composerData = readJson(composerJsonPath);
  const installerPath = `${requireEnv('DRUPAL_CUSTOM_MODULE_DIR')}/{$name}`;
  const vendorKey = `vendor:${requireEnv('CUSTOM_MODULE_VENDOR')}`;

  composerData.extra = composerData.extra || {};
  composerData.extra['installer-paths'] = composerData.extra['installer-paths'] || {};

  if (!composerData.extra['installer-paths'][installerPath]) {
    composerData.extra['installer-paths'][installerPath] = [];
  }

  if (!composerData.extra['installer-paths'][installerPath].includes(vendorKey)) {
    composerData.extra['installer-paths'][installerPath].unshift(vendorKey);
  }

  writeJson(composerJsonPath, composerData);
}

function setComposerRepository(projectPath, name, config) {
  console.log(`Adding repository: ${name}`);
  runComposer(['config', `repositories.${name}`, JSON.stringify(config)], { cwd: projectPath });
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

function buildRepositoryConfig(entry) {
  const defaultOrg = (env.CUSTOM_MODULE_REPOSITORY_ORG || '').trim();
  const [rawName, mappedUrl] = splitRepositoryMapping(entry);

  if (rawName && mappedUrl) {
    const normalizedName = rawName.includes('/') ? rawName.split('/')[1] : rawName;
    const isComposerRepository = /^https?:\/\//.test(mappedUrl) && !mappedUrl.endsWith('.git');

    return {
      name: normalizedName,
      config: isComposerRepository
        ? { type: 'composer', url: mappedUrl, canonical: false }
        : { type: 'vcs', url: mappedUrl, 'no-api': true, canonical: false }
    };
  }

  const [org, repoName] = entry.includes('/') ? entry.split('/', 2) : [defaultOrg, entry];
  if (!org || !repoName) {
    throw new Error(`Invalid composer repository entry: ${entry}`);
  }

  return {
    name: repoName,
    config: {
      type: 'vcs',
      url: `git@github.com:${org}/${repoName}.git`,
      'no-api': true,
      canonical: false
    }
  };
}

REQUIRED_ENV_VARS.forEach(requireEnv);

const projectPath = resolvePathFromWorkspace(requireEnv('DRUPAL_PROJECT_DIR'));
const composerJsonPath = path.join(projectPath, 'composer.json');
const moduleWorkingDirectory = resolvePathFromWorkspace(env.CUSTOM_MODULE_WORKING_DIRECTORY || '');
const modulePackage = env.CUSTOM_MODULE_PACKAGE && env.CUSTOM_MODULE_PACKAGE.trim()
  ? env.CUSTOM_MODULE_PACKAGE.trim()
  : `${requireEnv('CUSTOM_MODULE_VENDOR')}/${requireEnv('CUSTOM_MODULE_REPOSITORY_NAME')}`;

console.log({ projectPath, moduleWorkingDirectory, modulePackage });

runComposer([
  'create-project',
  `drupal/recommended-project:^${requireEnv('DRUPAL_VERSION')}`,
  projectPath,
  '--no-interaction',
  '--no-install'
]);

if (env.COMPOSER_GH_PAT && env.COMPOSER_GH_PAT.trim()) {
  runComposer(['config', '--global', 'github-oauth.github.com', env.COMPOSER_GH_PAT.trim()]);
}

runComposer(['config', 'allow-plugins.tbachert/spi', 'true'], { cwd: projectPath });
runComposer(['config', 'minimum-stability', 'dev'], { cwd: projectPath });
runComposer(['config', 'prefer-stable', 'true'], { cwd: projectPath });
runComposer(['require', '--dev', 'drupal/core-dev', 'drush/drush', 'fakerphp/faker'], { cwd: projectPath });

setInstallerPath(composerJsonPath);

setComposerRepository(
  projectPath,
  requireEnv('CUSTOM_MODULE_NAME'),
  moduleWorkingDirectory
    ? { type: 'path', url: moduleWorkingDirectory, canonical: true, options: { symlink: false } }
    : {
        type: 'vcs',
        url: `git@github.com:${env.CUSTOM_MODULE_REPOSITORY_ORG}/${requireEnv('CUSTOM_MODULE_REPOSITORY_NAME')}.git`,
        'no-api': true
      }
);

const repositories = parseRepositoryEntries(env.COMPOSER_REPOSITORIES);
console.log({ repositories });
for (const entry of repositories) {
  const repository = buildRepositoryConfig(entry);
  setComposerRepository(projectPath, repository.name, repository.config);
}

runComposer(['require', `${modulePackage}:${requireEnv('CUSTOM_MODULE_REPOSITORY_REF')}`, '-W'], { cwd: projectPath });
