const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const env = process.env;
const run = (cmd, opts = {}) => {
  console.log(`\n> ${cmd}`);
  execSync(cmd, { stdio: 'inherit', ...opts });
};

// 1. Initialize Project
run(`composer create-project drupal/recommended-project:^${env.DRUPAL_VERSION} ${env.DRUPAL_PROJECT_DIR} --no-interaction --no-install`);
const projectPath = path.resolve(env.DRUPAL_PROJECT_DIR);

// 2. Base Composer Configurations
run('composer config allow-plugins.tbachert/spi true', { cwd: projectPath });
run('composer config minimum-stability dev', { cwd: projectPath });
run('composer config prefer-stable true', { cwd: projectPath });
run('composer require --dev drupal/core-dev drush/drush', { cwd: projectPath });

if (env.COMPOSER_GH_PAT) {
  run(`composer config github-oauth.github.com ${env.COMPOSER_GH_PAT}`, { cwd: projectPath });
}

// 3. Modify composer.json natively
const composerJsonPath = path.join(projectPath, 'composer.json');
const composerData = JSON.parse(fs.readFileSync(composerJsonPath, 'utf8'));

composerData.extra = composerData.extra || {};
composerData.extra['installer-paths'] = {
  [`${env.DRUPAL_CUSTOM_MODULE_DIR}/{$name}`]: [`vendor:${env.CUSTOM_MODULE_VENDOR}`],
  ...composerData.extra['installer-paths']
};
fs.writeFileSync(composerJsonPath, JSON.stringify(composerData, null, 4));

// 4. Configure local custom module repository
const repoConfig = { type: 'vcs', url: `git@github.com:${env.CUSTOM_MODULE_REPOSITORY_ORG}/${env.CUSTOM_MODULE_REPOSITORY_NAME}.git` , 'no-api': true };
run(`composer config repositories.${env.CUSTOM_MODULE_NAME} '${JSON.stringify(repoConfig)}'`, { cwd: projectPath });

// 5. Parse and add extra repositories
const repoString = env.COMPOSER_REPOSITORIES || '';
const repos = repoString.split('\n')
  .map(line => line.replace(/^- /, '').trim())
  .filter(line => line.length > 0 && line !== '-');

for (const repo of repos) {
  let name, url;
  
  if (repo.includes(':')) {
    [name, url] = repo.split(':', 1);
    if (name.includes('/')) name = name.split('/')[1];
  } else {
    name = repo.includes('/') ? repo.split('/')[1] : repo;
    const org = repo.includes('/') ? repo.split('/')[0] : env.CUSTOM_MODULE_REPOSITORY_ORG;
    url = `git@github.com:${org}/${name}.git`;
  }

  if (name && url) {
    console.log(`Adding repository: ${name}`);
    const repoConfig = { type: 'vcs', url: url, 'no-api': true };
    run(`composer config repositories.${name} '${JSON.stringify(repoConfig)}'`, { cwd: projectPath });
  }
}

// 6. Require the custom module
run(`composer require ${env.CUSTOM_MODULE_VENDOR}/${env.CUSTOM_MODULE_NAME}:${env.CUSTOM_MODULE_REPOSITORY_REF} -W`, { cwd: projectPath });