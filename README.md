# Drupal Custom Module CI Action

This composite GitHub Action creates a temporary Drupal project, installs a custom module through Composer, installs Drupal, and runs the module test suite with HTML coverage output.

## Requirements

- A runner or container with PHP, Composer, and Node.js available.
- A browser testing stack if your module includes browser tests.
- Xdebug coverage enabled when you want an actual coverage report.
- A database service reachable from the job container.

## Naming model

This action now separates Drupal naming from Composer naming.

Drupal values:
- `drupal_module_name`: Drupal machine name, for example `acp_2fa`
- `drupal_module_path`: installed directory name used when locating the tests, for example `acp_2fa` or `drupal-custom-module-ci-fixture`
- `drupal_module_dir`: parent directory under the Drupal project, for example `web/modules/custom` or `web/modules/acp-composer`

Composer values:
- `composer_package_name`: full package name, for example `acp/2fa`
- `repo_name`: repository slug used for the VCS repository, for example `2fa`
- `repo_org`: GitHub owner for the repository
- `repo_ref`: Composer version or VCS ref passed to `composer require`

If your package name, Drupal machine name, and installed directory all match, you can set only the basic values. If they differ, set them explicitly.

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
          drupal_module_name: drupal_module
          drupal_module_dir: web/modules/custom
          composer_package_name: nbey/drupal-module
          repo_name: drupal-module
          repo_org: nbey
          repo_ref: dev-${{ github.head_ref || github.ref_name }}#${{ github.sha }}
          composer_gh_pat: ${{ secrets.COMPOSER_PAT }}
```

## Explicit naming example

Use the explicit inputs when the Drupal machine name, the installed directory, and the Composer package name do not line up.

```yaml
- name: Run Drupal module CI action
  uses: nbey/drupal-custom-module-ci@main
  with:
    drupal_module_name: acp_2fa
    drupal_module_path: acp_2fa
    drupal_module_dir: web/modules/acp-composer
    composer_package_name: acp/2fa
    repo_name: 2fa
    repo_org: acp
    repo_ref: dev-${{ github.head_ref || github.ref_name }}#${{ github.sha }}
    composer_gh_pat: ${{ secrets.COMPOSER_PAT }}
```

## Input reference

| Input | Required | Default | Notes |
| --- | --- | --- | --- |
| `drupal_module_name` | No |  | Preferred Drupal machine name input. |
| `module_name` | No |  | Deprecated alias for `drupal_module_name`. |
| `drupal_module_path` | No | `drupal_module_name` | Directory name used when locating `tests/src`. |
| `drupal_module_dir` | No | `module_dir` | Preferred parent module directory input. Set this explicitly in new workflows. |
| `module_dir` | No | `web/modules/acp-composer` | Deprecated alias kept at its legacy default for backward compatibility. |
| `composer_package_name` | No | `<module_vendor>/<module_name-with-hyphens>` | Full Composer package name. Set this explicitly when package naming differs from the Drupal module name. |
| `module_vendor` | No |  | Fallback vendor used only when `composer_package_name` is omitted. |
| `repo_name` | Yes |  | Repository slug used for VCS repository configuration. |
| `repo_org` | Yes |  | GitHub owner used for VCS repository configuration. |
| `repo_ref` | Yes |  | Composer version or VCS ref required for the package under test. |
| `drupal_version` | No | `10` | Drupal major version used for `drupal/recommended-project`. |
| `project_dir` | No | `/tmp/drupal-site` | Temporary Drupal project path created during the job. |
| `working_directory` | No | `${{ github.workspace }}` | Local path repository for the module under test. |
| `composer_repositories` | No |  | Additional repositories to register before install. |
| `composer_gh_pat` | No |  | Token for private GitHub Composer or VCS dependencies. |
| `simpletest_db` | No | `mysql://root:root@mysql:3306/drupal_test` | Database DSN for the Drupal site install. |
| `action_ref` | No | `main` | Useful when testing changes to this action itself. |

## Additional repository formats

`composer_repositories` accepts one entry per line.

- `repo-name`: resolves to `git@github.com:<repo_org>/repo-name.git`
- `org/repo-name`: resolves to `git@github.com:org/repo-name.git`
- `name=https://packages.example.com`: registers a Composer repository
- `name:git@github.com:org/repo-name.git`: registers an explicit VCS repository

Lines beginning with `#` are ignored.

## Self-test workflow

This repository includes a self-test workflow at `.github/workflows/self-test.yml` and a fixture package under `fixtures/drupal-custom-module-ci-fixture`.

The fixture intentionally uses different Drupal and Composer naming conventions so the workflow exercises the mismatch case that originally broke test path resolution.

## Troubleshooting

If Composer fails with an error like this:

```text
Failed to execute git clone --mirror -- 'git@github.com:acpwebops/acp-drupal_webapi.git' ...
```

check these first:

1. `composer_gh_pat` is present and not expired.
2. The token has access to every private repository listed in `composer_repositories`.
3. `repo_name`, `repo_org`, and `composer_package_name` match the actual repository and package naming.

If PHPUnit cannot open the module tests directory, check `drupal_module_dir` and `drupal_module_path` first. Those values control the filesystem path used to locate `tests/src`.

## Backward compatibility

The new Drupal-versus-Composer inputs are additive. Existing workflows that still pass `module_name`, `module_dir`, and `module_vendor` continue to work with the legacy defaults and package-name fallback.

For new workflows, prefer setting `drupal_module_name`, `drupal_module_dir`, `drupal_module_path`, and `composer_package_name` explicitly so there is no ambiguity.