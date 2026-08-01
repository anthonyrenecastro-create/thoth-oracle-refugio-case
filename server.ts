import dotenv from 'dotenv';
import { startIdentityServer } from './src/server/identityHttpServer';

dotenv.config();

startIdentityServer();