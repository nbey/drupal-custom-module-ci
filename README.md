# Drupal Custom Module CI Action

This composite GitHub Action creates a temporary Drupal project, installs your custom module through Composer, installs Drupal, and runs the module test suite with HTML coverage output.

## What this action expects

- A runner or container with PHP, Composer, Node.js, and the browser tooling needed for Drupal browser tests.
- Xdebug coverage enabled if you want a populated coverage report.
- A database service reachable from the job container.
- Your custom module repository already checked out in the job workspace when you want to test local changes from the current branch.

The example below uses Pantheon's CI container because it already provides the browser stack commonly needed for Drupal test runs.

## Recommended usage

```yaml
name: Custom Module CI

on:
  pull_request:
  push:
    branches:
      - main

jobs:
  test:
    runs-on: ubuntu-latest
    container:
      image: quay.io/pantheon-public/build-tools-ci:8.x-php8.2
      options: --user root
      env:
        XDEBUG_MODE: coverage

    services:
      mysql:
        image: mysql:5.7
        env:
          MYSQL_ROOT_PASSWORD: root
          MYSQL_DATABASE: drupal_test
        ports:
          - 3306:3306
        options: >-
          --health-cmd="mysqladmin ping --silent"
          --health-interval=10s
          --health-timeout=5s
          --health-retries=5

    steps:
      - name: Check out module repository
        uses: actions/checkout@v4

      - name: Run Drupal module CI action
        uses: nbey/drupal-custom-module-ci@main
        with:
          module_name: drupal_module
          module_vendor: nbey
          repo_name: drupal-module
          repo_org: nbey
          repo_ref: dev-${{ github.head_ref || github.ref_name }}#${{ github.sha }}
          composer_gh_pat: ${{ secrets.COMPOSER_PAT }}
          composer_repositories: |
            - nbey/shared-drupal-library
            - private-packagist=https://repo.packagist.com/your-org/
```

## Input reference

| Input | Required | Default | Notes |
| --- | --- | --- | --- |
| `module_name` | Yes |  | Drupal machine name. This is used to locate the tests at `MODULE/tests/src`. |
| `module_vendor` | Yes |  | Composer vendor, for example `nbey`. |
| `repo_name` | Yes |  | Repository name and default Composer package name suffix. |
| `repo_org` | Yes |  | GitHub owner used for VCS repository resolution. |
| `repo_ref` | Yes |  | Composer version or VCS reference passed to `composer require`. |
| `module_package` | No | `<module_vendor>/<repo_name>` | Set this when the Composer package name does not match the repository name. |
| `drupal_version` | No | `10` | Drupal major version used for `drupal/recommended-project`. |
| `module_dir` | No | `web/modules/custom` | Install target for the custom module package. |
| `project_dir` | No | `/tmp/drupal-site` | Temporary Drupal project path created during the job. |
| `working_directory` | No | `${{ github.workspace }}` | Local path repository for the module under test. Override this only if the module is checked out somewhere else or if you want to force VCS resolution. |
| `composer_repositories` | No |  | Additional repositories to register before install. |
| `composer_gh_pat` | No |  | Token for private GitHub Composer/VCS dependencies. |
| `simpletest_db` | No | `mysql://root:root@mysql:3306/drupal_test` | Database DSN for Drupal test installation. |
| `action_ref` | No | `main` | Mostly useful when testing changes to this action itself. |

## Additional repository formats

`composer_repositories` accepts one entry per line. These are the supported patterns:

- `repo-name`: resolves to `git@github.com:<repo_org>/repo-name.git`
- `org/repo-name`: resolves to `git@github.com:org/repo-name.git`
- `name=https://packages.example.com`: registers a Composer repository
- `name:git@github.com:org/repo-name.git`: registers an explicit VCS repository

Lines beginning with `#` are ignored.

## Outputs and artifacts

- HTML coverage is uploaded as the `coverage-report` artifact.
- Browser test output is uploaded as the `simpletest_browser_output` artifact.

## Troubleshooting

If Composer fails with an error like this:

```text
Failed to execute git clone --mirror -- 'git@github.com:acpwebops/acp-drupal_webapi.git' ...
```

check these first:

1. `composer_gh_pat` is present and not expired.
2. The token has access to every private repository listed in `composer_repositories`.
3. The repository URL format matches one of the supported patterns above.

If your package installs correctly but the action cannot find tests, verify that `module_name` matches the Drupal module machine name rather than the repository slug.