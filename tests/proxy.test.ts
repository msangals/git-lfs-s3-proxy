import {describe, it, expect, vi, beforeEach} from 'vitest';

// Mock AWS SDK before importing the app
vi.mock('@aws-sdk/client-s3', () => {
    return {
        S3Client: vi.fn().mockImplementation(() => ({
            send: vi.fn().mockResolvedValue({
                Contents: [{Key: 'org/repo/objects/abc123'}],
                NextContinuationToken: undefined,
            }),
        })),
        GetObjectCommand: vi.fn(),
        PutObjectCommand: vi.fn(),
        ListObjectsV2Command: vi.fn(),
        DeleteObjectsCommand: vi.fn(),
    };
});

vi.mock('@aws-sdk/credential-provider-ini', () => ({
    fromIni: vi.fn().mockReturnValue({}),
}));

vi.mock('@aws-sdk/credential-provider-env', () => ({
    fromEnv: vi.fn().mockReturnValue({}),
}));

vi.mock('@aws-sdk/s3-request-presigner', () => ({
    getSignedUrl: vi.fn().mockResolvedValue('https://s3.example.com/presigned-url'),
}));

// Set env before importing app
process.env.S3_BUCKET = 'test-bucket';

import {app} from '../src/proxy';
import request from 'supertest';

describe('Git LFS S3 Proxy', () => {
    describe('GET /health', () => {
        it('returns 200 with status ok', async () => {
            const res = await request(app).get('/health');
            expect(res.status).toBe(200);
            expect(res.body).toEqual({status: 'ok'});
        });
    });

    describe('POST /:org/:repo/objects/batch', () => {
        it('returns download presigned URLs for download operation', async () => {
            const res = await request(app)
                .post('/myorg/myrepo/objects/batch')
                .set('Content-Type', 'application/vnd.git-lfs+json')
                .send({
                    operation: 'download',
                    transfers: ['basic'],
                    ref: {name: 'refs/heads/main'},
                    objects: [{oid: 'abc123', size: 1024}],
                    hash_algo: 'sha256',
                });

            expect(res.status).toBe(200);
            expect(res.body.transfer).toBe('basic');
            expect(res.body.objects).toHaveLength(1);
            expect(res.body.objects[0].oid).toBe('abc123');
            expect(res.body.objects[0].size).toBe(1024);
            expect(res.body.objects[0].actions.download.href).toBe('https://s3.example.com/presigned-url');
            expect(res.body.objects[0].actions.download.expires_in).toBe(3600);
        });

        it('returns upload presigned URLs for upload operation', async () => {
            const res = await request(app)
                .post('/myorg/myrepo/objects/batch')
                .set('Content-Type', 'application/vnd.git-lfs+json')
                .send({
                    operation: 'upload',
                    transfers: ['basic'],
                    ref: {name: 'refs/heads/main'},
                    objects: [{oid: 'def456', size: 2048}],
                    hash_algo: 'sha256',
                });

            expect(res.status).toBe(200);
            expect(res.body.transfer).toBe('basic');
            expect(res.body.objects).toHaveLength(1);
            expect(res.body.objects[0].oid).toBe('def456');
            expect(res.body.objects[0].actions.upload.href).toBe('https://s3.example.com/presigned-url');
            expect(res.body.objects[0].actions.upload.expires_in).toBe(3600);
        });

        it('handles multiple objects in a single batch', async () => {
            const res = await request(app)
                .post('/myorg/myrepo/objects/batch')
                .set('Content-Type', 'application/vnd.git-lfs+json')
                .send({
                    operation: 'download',
                    transfers: ['basic'],
                    ref: {name: 'refs/heads/main'},
                    objects: [
                        {oid: 'aaa', size: 100},
                        {oid: 'bbb', size: 200},
                        {oid: 'ccc', size: 300},
                    ],
                    hash_algo: 'sha256',
                });

            expect(res.status).toBe(200);
            expect(res.body.objects).toHaveLength(3);
        });

        it('returns 400 for invalid operation', async () => {
            const res = await request(app)
                .post('/myorg/myrepo/objects/batch')
                .set('Content-Type', 'application/vnd.git-lfs+json')
                .send({
                    operation: 'invalid',
                    transfers: ['basic'],
                    ref: {name: 'refs/heads/main'},
                    objects: [{oid: 'abc123', size: 1024}],
                    hash_algo: 'sha256',
                });

            expect(res.status).toBe(400);
            expect(res.body.message).toBe('Invalid operation');
        });
    });

    describe('GET /list-objects', () => {
        it('returns list of object keys from S3', async () => {
            const res = await request(app).get('/list-objects');
            expect(res.status).toBe(200);
            expect(res.body.objectKeys).toEqual(['org/repo/objects/abc123']);
        });
    });
});
