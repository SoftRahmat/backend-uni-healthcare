import express, { Application, Request, Response } from "express";
import { prisma } from "./app/lib/prisma";

const app: Application = express();

// Enable URL-encoded form data parsing
app.use(express.urlencoded({ extended: true }));

// Middleware to parse JSON bodies
app.use(express.json());

// Basic route
app.get('/', async (req: Request, res: Response) => {
  const specialty = await prisma.specialty.create({
    data: {
      title: "General Medicine"
    }
  });
  res.status(200).json({
    success: true, 
    message: "Welcome to the Healthcare API!",
    data: specialty }) ;
});

export default app;