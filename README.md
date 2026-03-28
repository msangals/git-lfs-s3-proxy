# Git LFS S3 Proxy

A lightweight Node.js proxy that connects [Git LFS](https://git-lfs.com/) clients to Amazon S3. Instead of storing large files on your Git host, this proxy responds to Git LFS batch requests with pre-signed S3 URLs so clients upload and download directly to/from your own bucket.

## How it works

```
git push (LFS)              git pull (LFS)
      |                           |
      v                           v
 ┌──────────┐              ┌──────────┐
 │ LFS batch│  POST /batch │ LFS batch│
 │ request  │─────────────>│ response │
 └──────────┘              └──────────┘
                  |
                  v
         ┌───────────────┐
         │  git-lfs-s3   │  generates pre-signed
         │    proxy       │  S3 URLs (1 hr TTL)
         └───────────────┘
                  |
                  v
         ┌───────────────┐
         │   Amazon S3   │  client uploads/downloads
         │   (your bucket)│  directly via signed URL
         └───────────────┘
```

The proxy never touches file content. It only brokers pre-signed URLs.

Objects are stored in S3 under the key pattern:

```
{organization}/{repository}/objects/{oid}
```

## Prerequisites

- Node.js 18+
- An AWS account with an S3 bucket
- AWS credentials (environment variables or CLI profile)

## Quick start

```shell
npm install
npm run build
```

Set the required environment variables and start the server:

```shell
export S3_BUCKET=my-git-lfs-bucket
export AWS_REGION=eu-west-1            # optional, defaults to eu-west-1
export AWS_ACCESS_KEY_ID=AKIA...
export AWS_SECRET_ACCESS_KEY=...

npm start
```

The server starts on `http://localhost:3000`. On startup it validates S3 connectivity and will refuse to start if credentials are invalid or `S3_BUCKET` is not set.

## Docker

A pre-built multi-arch image (`linux/amd64`, `linux/arm64`) is available on Docker Hub:

```shell
docker run \
  --name git_lfs_proxy \
  -e S3_BUCKET=my-git-lfs-bucket \
  -e AWS_ACCESS_KEY_ID=AKIA... \
  -e AWS_SECRET_ACCESS_KEY=... \
  -p 3000:3000 \
  msangals/git-lfs-s3-proxy
```

Or use an AWS CLI profile by mounting your credentials:

```shell
docker run \
  --name git_lfs_proxy \
  -v ~/.aws:/root/.aws \
  -e AWS_PROFILE=my-aws-profile \
  -e S3_BUCKET=my-git-lfs-bucket \
  -p 3000:3000 \
  msangals/git-lfs-s3-proxy
```

## Configuration

### Environment variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `S3_BUCKET` | Yes | — | S3 bucket name for storing LFS objects |
| `AWS_REGION` | No | `eu-west-1` | AWS region for the S3 client |
| `AWS_PROFILE` | No | — | AWS CLI profile name (reads from `~/.aws/credentials`) |
| `AWS_ACCESS_KEY_ID` | Conditional | — | Required when `AWS_PROFILE` is not set |
| `AWS_SECRET_ACCESS_KEY` | Conditional | — | Required when `AWS_PROFILE` is not set |
| `AWS_SESSION_TOKEN` | No | — | Optional session token for temporary credentials |

If `AWS_PROFILE` is set, credentials are loaded from the AWS CLI configuration. Otherwise, credentials are read from environment variables.

## Client setup

Add a `.lfsconfig` file to the root of any Git repository that should use this proxy:

```ini
[lfs]
    url = http://localhost:3000/myorganization/myrepository
```

Replace `myorganization` and `myrepository` with the actual names. These values determine the S3 key prefix for stored objects.

After committing `.lfsconfig`, standard `git lfs push` and `git lfs pull` commands will route through the proxy.

## API endpoints

### `POST /:org/:repo/objects/batch`

The core Git LFS batch endpoint. Accepts `application/vnd.git-lfs+json` requests and returns pre-signed S3 URLs for upload or download operations. URLs expire after 1 hour.

### `GET /list-objects`

Lists all object keys in the configured S3 bucket. Returns JSON:

```json
{ "objectKeys": ["org/repo/objects/abc123...", ...] }
```

### `DELETE /delete-all-objects`

Deletes **all** objects in the configured S3 bucket. Handles pagination for buckets with more than 1,000 objects.

> **Warning:** This deletes everything in the bucket, not scoped to a single repository.

### `GET /health`

Returns `{"status": "ok"}`. Useful for load balancer health checks.

## npm scripts

| Script | Command | Description |
|--------|---------|-------------|
| `build` | `tsc` | Compile TypeScript to `dist/` |
| `start` | `node dist/proxy.js` | Run the compiled server |

## Security considerations

- The proxy itself has **no authentication layer**. Anyone who can reach port 3000 can interact with LFS objects. Deploy behind a reverse proxy, VPN, or firewall as appropriate.
- Ensure your AWS credentials have only the necessary S3 permissions (`s3:GetObject`, `s3:PutObject`, `s3:ListBucket`, `s3:DeleteObject`).
- Pre-signed URLs are time-limited (1 hour) but grant direct access to S3 objects for anyone who obtains them.

## Project structure

```
src/
  proxy.ts          # Entire application (Express server + S3 integration)
dist/
  proxy.js          # Compiled output
Dockerfile          # Multi-stage build for production image
.github/
  workflows/
    build.yaml      # CI: multi-arch Docker build and push to Docker Hub
  dependabot.yml    # Weekly npm dependency updates
```

## License

[MIT](LICENSE)
