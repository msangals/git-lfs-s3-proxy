// Install necessary dependencies:
// npm install express body-parser cors aws-sdk-v3

import express from 'express';
import {
    DeleteObjectsCommand,
    GetObjectCommand,
    ListObjectsV2Command,
    ListObjectsV2Output,
    PutObjectCommand,
    S3Client
} from '@aws-sdk/client-s3';
import {fromIni} from '@aws-sdk/credential-provider-ini';
import {fromEnv} from '@aws-sdk/credential-provider-env';
import {getSignedUrl} from "@aws-sdk/s3-request-presigner";

const app = express();
const port = 3000;

// Middleware to parse JSON bodies
app.use(express.json({
    type: 'application/vnd.git-lfs+json',
}));

// Create an S3 client with the existing credentials
const s3Client = new S3Client({
    region: process.env.AWS_REGION ? process.env.AWS_REGION : "eu-west-1",
    credentials: process.env.AWS_PROFILE ? fromIni({profile: process.env.AWS_PROFILE}) : fromEnv(),
});

// Specify your S3 bucket name
const s3Bucket = process.env.S3_BUCKET;

interface GitLFSBatchResponse {
    transfer: string;
    objects: {
        oid: string;
        size: number;
        authenticated?: boolean;
        actions: {
            download?: {
                href: string;
                header?: Record<string, string>;
                expires_in?: number;
                expires_at?: string;
            };
            upload?: {
                href: string;
                header?: Record<string, string>;
                expires_in?: number;
                expires_at?: string;
            };
        };
    }[];
    hash_algo?: string;
}

interface GitLFSBatchRequest {
    operation: string;
    transfers: string[];
    ref: {
        name: string;
    };
    objects: {
        oid: string;
        size: number;
    }[];
    hash_algo: string;
}


// Git LFS batch endpoint
app.post('/:organizationName/:repositoryName/objects/batch', async (req, res) => {
    const {organizationName, repositoryName} = req.params;
    const repositoryPrefix = `${organizationName}/${repositoryName}`;
    const batchResponse: GitLFSBatchResponse = {
        transfer: "basic",
        objects: []
    };

    // Ensure the necessary headers are set in the response
    res.setHeader('Content-Type', 'application/vnd.git-lfs+json');

    const request: GitLFSBatchRequest = req.body;
    const operation: String = request.operation;

    try {
        if (operation === 'download') {
            // Handle download operation
            for (const obj of request.objects) {
                const {oid, size} = obj;

                // Generate pre-signed URL for S3 upload
                const objectKey = `${repositoryPrefix}/objects/${oid}`;
                const downloadUrl = await getPresignedDownloadUrl(objectKey, size);

                batchResponse.objects.push({
                    oid,
                    size,
                    actions: {
                        download: {
                            href: downloadUrl,
                            expires_in: 3600, // Set expiration time as needed
                        },
                    },
                });
            }
        } else if (operation === 'upload') {
            // Handle upload operation with pre-signed URLs
            for (const obj of request.objects) {
                const {oid, size} = obj;

                // Generate pre-signed URL for S3 upload
                const uploadKey = `${repositoryPrefix}/objects/${oid}`;
                const uploadUrl = await getPresignedUploadUrl(uploadKey, size);

                batchResponse.objects.push({
                    oid,
                    size,
                    actions: {
                        upload: {
                            href: uploadUrl,
                            expires_in: 3600, // Set expiration time as needed
                        },
                    },
                });
            }
        } else {
            console.error('Invalid operation:', operation);
            res.status(400).json({message: 'Invalid operation'});
            return;
        }

        res.status(200).json(batchResponse);
    } catch (error) {
        console.error('Error processing batch request:', error);
        res.status(500).send('Internal Server Error');
    }
});

async function getPresignedDownloadUrl(objectKey: string, size: number): Promise<string> {
    const expirationTime = new Date();
    expirationTime.setHours(expirationTime.getHours() + 1);
    const command = new GetObjectCommand({
        Bucket: s3Bucket,
        Key: objectKey,
    });

    return getSignedUrl(s3Client, command);
}

async function getPresignedUploadUrl(objectKey: string, size: number): Promise<string> {
    const putObjectCommand = new PutObjectCommand({
        Bucket: s3Bucket,
        Key: objectKey,
        ContentType: 'application/octet-stream', // Set content type as needed
    });

    return await getSignedUrl(s3Client, putObjectCommand);
    ;
}


// Endpoint to list objects in the S3 bucket
app.get('/list-objects', async (req, res) => {
    try {
        // Use the AWS SDK to list objects in the S3 bucket
        const listObjectsResponse = await s3Client.send(
            new ListObjectsV2Command({
                Bucket: s3Bucket,
            })
        );

        // Extract object keys from the response
        const objectKeys = listObjectsResponse.Contents?.map((object) => object.Key) || [];

        res.status(200).json({objectKeys});
    } catch (error) {
        console.error('Error listing objects in S3 bucket:', error);
        res.status(500).send('Internal Server Error');
    }
});

// Endpoint to delete all objects in the S3 bucket
app.delete('/delete-all-objects', async (req, res) => {
    try {
        await deleteAllObjects(s3Bucket!);
        res.status(200).send('All objects deleted successfully.');
    } catch (error) {
        console.error('Error handling delete-all-objects request:', error);
        res.status(500).send('Internal Server Error');
    }
});

// Endpoint to list objects in the S3 bucket
app.get('/health', async (req, res) => {
    res.status(200).json({"status": "ok"});
});

async function deleteAllObjects(bucket: string) {
    try {
        let continuationToken;
        do {
            // Use the AWS SDK to list objects in the S3 bucket
            const listObjectsResponse: ListObjectsV2Output = await s3Client.send(
                new ListObjectsV2Command({
                    Bucket: bucket,
                    ContinuationToken: continuationToken,
                })
            );

            // Log the list of objects before deletion
            console.log('Objects to be deleted:', listObjectsResponse.Contents);

            // Delete all objects in the S3 bucket
            if (listObjectsResponse.Contents && listObjectsResponse.Contents.length > 0) {
                const deleteResponse = await s3Client.send(
                    new DeleteObjectsCommand({
                        Bucket: bucket,
                        Delete: {
                            Objects: listObjectsResponse.Contents.map((object) => ({Key: object.Key})),
                            Quiet: false,
                        },
                    })
                );

                console.log('Objects deleted successfully.');
            } else {
                console.log('No objects found in the bucket.');
            }

            // Update the continuation token for the next iteration
            continuationToken = listObjectsResponse.NextContinuationToken;
        } while (continuationToken);
    } catch (error) {
        console.error('Error deleting objects in S3 bucket:', error);
    }
}

// Validation method to check if S3 client is authenticated
async function validateS3Authentication() {
    // Validate that the S3_BUCKET environment variable is provided
    if (!s3Bucket) {
        console.error('Error: S3_BUCKET environment variable is not provided.');
        process.exit(1); // Exit the process with an error code
    }

    try {
        // Use the AWS SDK to list objects in the S3 bucket
        await s3Client.send(new ListObjectsV2Command({Bucket: s3Bucket}));
        console.log('S3 client authenticated successfully.');
    } catch (error) {
        console.error('Error authenticating S3 client:', error);
        throw new Error('S3 client authentication failed.');
    }
}

// Validate S3 client authentication on server startup
validateS3Authentication()
    .then(() => {
        // Start the Git LFS server if S3 authentication is successful
        app.listen(port, () => {
            console.log(`Git LFS server listening at http://localhost:${port}`);
        });
    })
    .catch((error) => {
        console.error('Unable to start Git LFS server:', error.message);
    });
