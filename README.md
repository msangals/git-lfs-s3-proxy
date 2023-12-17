# Git LFS S3 Proxy Documentation

## Introduction

The Git LFS (Large File Storage) S3 Proxy is a server application that acts as a proxy between a Git LFS client and an Amazon S3 bucket. It allows seamless integration of Git LFS with S3 for storing and retrieving large files. This proxy handles Git LFS batch requests, generating pre-signed URLs for S3 upload and download operations.

## Prerequisites

Before using the Git LFS S3 Proxy, ensure that the following dependencies are installed:

-   Node.js
-   Yarn (Package Manager for Node.js)

Install necessary Node.js packages using Yarn by running:

```shell
yarn install
```

## Configuration

### AWS Configuration

Set up AWS credentials either through environment variables or a profile in the AWS CLI. The proxy uses the AWS SDK for JavaScript v3 to interact with S3.

Environment variables:

-   `AWS_REGION`: AWS region (default is "eu-west-1")
-   `AWS_PROFILE`: AWS CLI profile name

Or:

-   `AWS_REGION`: AWS region (default is "eu-west-1")
-   `AWS_ACCESS_KEY_ID`
-   `AWS_SECRET_ACCESS_KEY`
-   `AWS_SESSION_TOKEN`

### Proxy Configuration

Configure the proxy by setting the following environment variables:

-   `S3_BUCKET`: S3 bucket name where Git LFS objects will be stored.

## Running the Proxy

Start the Git LFS S3 Proxy by executing the following command:

```
yarn start
```

Or using the prebuild docker image:

```shell
docker run \
  --name git_lfs_proxy \
  -v ~/.aws:/root/.aws \
  -e AWS_PROFILE=my-aws-profile \
  -e S3_BUCKET=my-git-lfs-s3-bucket \
  -p 3000:3000 \
  msangals/git-lfs-s3-proxy
```

The proxy will be accessible at `http://localhost:3000` by default.

## Endpoints

### 1\. Git LFS Batch Endpoint

#### Endpoint

-   `POST /:organizationName/:repositoryName/objects/batch`

#### Purpose

Handles Git LFS batch requests, providing pre-signed URLs for S3 upload and download operations.

#### Request Format

-   Accepts Git LFS batch requests in JSON format.

#### Response Format

-   Responds with Git LFS batch response containing pre-signed URLs.

### 2\. List Objects Endpoint

#### Endpoint

-   `GET /list-objects`

#### Purpose

Lists objects in the configured S3 bucket.

#### Response Format

-   Responds with a JSON object containing a list of object keys.

### 3\. Delete All Objects Endpoint

#### Endpoint

-   `DELETE /delete-all-objects`

#### Purpose

Deletes all objects in the configured S3 bucket.

#### Response Format

-   Responds with a success message if deletion is successful.

### 4\. Health Check Endpoint

#### Endpoint

-   `GET /health`

#### Purpose

Provides a health check endpoint to verify the status of the proxy.

#### Response Format

-   Responds with a JSON object indicating the status.

### Error Handling

In case of errors during batch request processing or S3 operations, appropriate HTTP status codes are returned, and error details are logged to the console.

### Security Considerations

-   Ensure that AWS credentials have the necessary permissions for S3 operations.
-   Configure proper firewall rules and access controls for the server running the proxy.

### Conclusion

The Git LFS S3 Proxy facilitates the integration of Git LFS with Amazon S3, providing a scalable solution for managing large files in Git repositories.


## Setting Up Git LFS Configuration

### .lfsconfig File

To ensure that Git LFS operations are directed through the Git LFS S3 Proxy, you need to configure the Git LFS URL in your repository. This is achieved by creating a `.lfsconfig` file in the root of your Git repository.

1.  Create a file named `.lfsconfig` in the root directory of your Git repository.

2.  Open the `.lfsconfig` file in a text editor and add the following content:

    iniCopy code

    `[lfs]
    url = http://localhost:3000/:organizationName/:repositoryName/objects/batch`

    Replace `:organizationName` and `:repositoryName` with the appropriate values for your organization and repository.

    Example `.lfsconfig` file content:

    iniCopy code

    ```
    [lfs]
        url = http://localhost:3000/myorganization/myrepository/objects/batch
    ```

3.  Save and commit the `.lfsconfig` file to your Git repository.

### Explanation

The `.lfsconfig` file specifies the URL that Git LFS should use for batch operations such as uploading and downloading large files. By setting this URL to your Git LFS S3 Proxy endpoint, you ensure that all Git LFS traffic is directed through the proxy, allowing it to generate pre-signed URLs for S3 operations.

Make sure to replace the placeholders in the URL with the actual organization and repository names. This URL format corresponds to the Git LFS batch endpoint provided by the Git LFS S3 Proxy.

### Updating Existing Repositories

If you are adding Git LFS to an existing repository, ensure that all contributors update their local repositories with the new `.lfsconfig` file. This can be done by pulling the latest changes from the remote repository after the `.lfsconfig` file has been committed.

With the `.lfsconfig` file in place, your Git LFS client will use the specified proxy URL for all interactions with large files, seamlessly integrating the Git LFS S3 Proxy into your workflow.
