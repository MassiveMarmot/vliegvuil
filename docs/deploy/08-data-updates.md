## 8. Data updates (option C)

The server runs **no data jobs**. Data freshness is handled by GitHub Actions
workflows (session 22c): a scheduled check opens or updates one issue when
upstream datasets changed, and a scheduled or manually dispatched refresh
opens a pull request with the changed snapshots and `sources.json`. You
review and merge the PR, then deploy as in §7.

- The VPS needs no GitHub credential while the repository is public.
- Never run `refresh` on the server: it rewrites tracked files in
  `web/public/data/` and the server would diverge from git.
- Roll back a bad refresh by reverting the data PR on GitHub, then §7.

The `deploy/` timer files were removed from the repository in session 22c
(the workflows replaced them). If you installed them from an earlier
version of this guide, remove them once:

```bash
sudo systemctl disable --now vliegvuil-data-refresh.timer
sudo rm -f /etc/systemd/system/vliegvuil-data-check.service \
           /etc/systemd/system/vliegvuil-data-refresh.service \
           /etc/systemd/system/vliegvuil-data-refresh.timer
sudo systemctl daemon-reload
```

See `docs/data-updates.md` for how the two workflows work and what to
check after the first real run (`workflow_dispatch` with `dry_run`).

