import express from 'express';
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import userRoutes from './modules/users/user_routes.js';
import forumRoutes from './modules/forum/forum_routes.js';
import subjectRoutes from './modules/subject/subject_routes.js';
import { corsHandler } from './middleware/corsHandler.js';
import { loggingHandler } from './middleware/loggingHandler.js';
import { routeNotFound } from './middleware/routeNotFound.js';
import swaggerUi from 'swagger-ui-express';
import swaggerJSDoc from 'swagger-jsdoc';
import http from 'http';
import { Server } from 'socket.io';
import { verifyAccessToken } from './modules/auth/jwt.js';

dotenv.config(); // Cargamos las variables de entorno desde el archivo .env

const app = express();

const LOCAL_PORT = process.env.SERVER_PORT || 9000;

// Configuración de Swagger
const swaggerOptions = {
    definition: {
        openapi: '3.0.0',
        info: {
            title: 'API de Usuarios',
            version: '1.0.0',
            description: 'Documentación de la API de Usuarios'
        },
        tags: [
            {
                name: 'Users',
                description: 'Rutas relacionadas con la gestión de usuarios'
            },
            {
                name: 'Forum',
                description: 'Rutas relacionadas con el forum'
            },
            {
                name: 'Main',
                description: 'Rutas principales de la API'
            }
        ],
        servers: [
            {
                url: `http://localhost:${LOCAL_PORT}`
            }
        ]
    },
    apis: ['./modules/users/*.js', './modules/forum/*.js', './modules/subject/*.js'] // Asegúrate de que esta ruta apunta a tus rutas
};

const swaggerSpec = swaggerJSDoc(swaggerOptions);

app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));

// Middleware
app.use(express.json());
app.use(loggingHandler);
app.use(corsHandler);

const httpServer = http.createServer(app);

// -------------------- SERVIDOR DE CHAT SOCKET.IO --------------------
// Interfaz para tipado de mensajes del chat
interface ChatMessage {
    room: string;
    author: string;
    message: string;
    time: string;
}

// Puerto específico para el servidor de chat
const CHAT_PORT = process.env.CHAT_PORT || 3001;

// Crear servidor HTTP para el chat
const chatServer = http.createServer();

// Configurar Socket.IO para el chat con CORS
const chatIO = new Server(chatServer, {
    cors: {
        origin: '*', // Permitir cualquier origen (ajustar en producción)
        methods: ['GET', 'POST'],
        credentials: true
    }
});

// Manejar conexiones de Socket.IO para el chat
chatIO.on('connection', (socket) => {
    console.log(`User connected to chat: ${socket.id}`);

    // JWT Verification Middleware
    socket.use(([event, ...args], next) => {
        const token = socket.handshake.auth.token;
        if (!token) return next(new Error('unauthorized'));

        try {
            verifyAccessToken(token);
            return next();
        } catch (err) {
            return next(new Error('unauthorized'));
        }
    });

    socket.on('error', (err) => {
        if (err?.message === 'unauthorized') {
            console.debug('Unauthorized user');
            socket.emit('status', { status: 'unauthorized' });
            socket.disconnect();
        }
    });

    socket.on('join_room', (roomId: string) => {
        socket.join(roomId);
        console.log(`User ${socket.id} joined room: ${roomId}`);
        
        try {
            const token = socket.handshake.auth.token;
            const decoded = verifyAccessToken(token);
            socket.to(roomId).emit('user_connected', {
                room: roomId,
                username: decoded.name,
                time: new Date().toLocaleTimeString()
            });
        } catch (err) {
            console.debug('Could not decode token for connection notification');
        }
    });

    socket.on('send_message', (data: ChatMessage) => {
        socket.to(data.room).emit('receive_message', data);
        console.log(`Message sent in room ${data.room} by ${data.author}: ${data.message}`);
    });

    socket.on('disconnect', () => {
        console.log(`User disconnected: ${socket.id}`);
        
        try {
            const token = socket.handshake.auth.token;
            const decoded = verifyAccessToken(token);
            const rooms = Array.from(socket.rooms);
            
            rooms.forEach(room => {
                if (room !== socket.id) {
                    socket.to(room).emit('user_disconnected', {
                        room,
                        username: decoded.name,
                        time: new Date().toLocaleTimeString()
                    });
                }
            });
        } catch (err) {
            console.debug('Could not decode token for disconnect notification');
        }
    });
});

// Iniciar el servidor de chat
chatServer.listen(CHAT_PORT, () => {
    console.log(`Servidor de chat escuchando en http://localhost:${CHAT_PORT}`);
});

// -------------------- RUTAS API Y SERVIDOR EXPRESS --------------------
app.use('/api', userRoutes);
app.use('/api', forumRoutes);
app.use('/api', subjectRoutes);

// Rutas de prueba
app.get('/', (req, res) => {
    res.send('Welcome to my API');
});

// Conexión a MongoDB
mongoose
    .connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/test')
    .then(() => console.log('Connected to DB'))
    .catch((error) => console.error('DB Connection Error:', error));

// Iniciar el servidor Express
app.listen(LOCAL_PORT, () => {
    console.log('Server listening on port: ' + LOCAL_PORT);
    console.log(`Swagger disponible en http://localhost:${LOCAL_PORT}/api-docs`);
});
