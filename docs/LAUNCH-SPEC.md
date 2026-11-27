# CRM launch specification

For the developers of the CRM (DECISIONS 32). When a person clicks the OUTCOMES button in the CRM, the CRM builds a signed link and opens it in a new window. OUTCOMES checks the signature and signs the person in. OUTCOMES stores no passwords.

## The steps in the CRM
1. Add the OUTCOMES permissions to the Roles and Permissions page (list below). Show the OUTCOMES button only to roles that hold `outcomes.access`.
2. On click, build a launch token (below) and open `https://<outcomes address>/api/launch?token=<token>` in a new window.

## Permissions to register
| Permission | Lets the person |
|---|---|
| `outcomes.access` | Open OUTCOMES at all. Without it nothing else works |
| `outcomes.view_work_orders` | See work orders and the setup |
| `outcomes.map_frameworks` | Sort items into frameworks, and change frameworks and categories |
| `outcomes.dashboards` | See dashboards |
| `outcomes.other_sources` | Use file and Google Sheet sources |
| `outcomes.settings` | See settings and run a pick-up now |
| `outcomes.partner` | A partner organisation's own sign-in (with the `partner` claim below). Never given to MWF staff roles |
| `outcomes.approve_release` | Approve releasing a sponsor's place after a missed payment (a manager, DECISIONS 74) |

## The launch token
Two parts joined by a dot: `base64url(JSON claims)` and `base64url(HMAC-SHA256(secret, first part))`. "base64url" is base64 with `-` and `_` instead of `+` and `/`, and no `=` padding.

| Claim | Meaning |
|---|---|
| `typ` | Always `"launch"` |
| `jti` | A new random id for this token, for example 32 random hex characters. A token works once |
| `sub` | The CRM user id |
| `name` | The person's display name |
| `org` | The organisation's short code. Every record in OUTCOMES belongs to one organisation |
| `partner` | Optional. Only for a partner organisation's user: the partner's id in OUTCOMES. The person then sees only that partner's own data, whatever `perms` lists, and holds only `outcomes.access` and `outcomes.partner` (DECISIONS 249). Leave it out for MWF staff |
| `perms` | List of the OUTCOMES permissions above that the person's role holds |
| `iat` | Now, in seconds since 1970 |
| `exp` | When it stops working, in seconds. At most 120 seconds after `iat`. Use 60 |

The secret is `LAUNCH_SECRET`. It is shared only between the CRM and OUTCOMES, kept on the server, and never put in a page, a link or the repository. Keep the two servers' clocks right (a 30 second difference is allowed).

## Example in PHP
```php
function outcomes_launch_url(array $user, array $perms, string $secret, string $base): string {
    $b64 = fn(string $s) => rtrim(strtr(base64_encode($s), '+/', '-_'), '=');
    $now = time();
    $claims = [
        'typ' => 'launch', 'jti' => bin2hex(random_bytes(16)),
        'sub' => (string) $user['id'], 'name' => $user['name'], 'org' => 'mwf',
        'perms' => array_values($perms), 'iat' => $now, 'exp' => $now + 60,
    ];
    $part = $b64(json_encode($claims));
    $sig  = $b64(hash_hmac('sha256', $part, $secret, true));
    return $base . '/api/launch?token=' . $part . '.' . $sig;
}
```

## What OUTCOMES does
It checks the signature, the type, the dates and the permission list, refuses a token it has seen before, then starts a one hour session in a secure cookie and sends the person to the app with a clean address. When the hour ends the person opens OUTCOMES from the CRM again. A person removed or changed in the CRM therefore loses or changes access within the hour.

## Still to agree
Refreshing the session by asking the CRM (instead of reopening) needs a small CRM endpoint that says whether a user still holds the permissions. It is not built.
