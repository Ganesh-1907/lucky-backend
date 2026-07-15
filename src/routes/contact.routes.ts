import { Router, Request, Response, NextFunction } from 'express';

const router = Router();

router.post('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { name, email, subject, message } = req.body;

    console.log('Contact form submission:', { name, email, subject, message });

    res.json({
      success: true,
      message: 'Thank you for your message. We will get back to you soon.',
    });
  } catch (error) {
    next(error);
  }
});

export default router;
