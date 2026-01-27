import {
  Body,
  Controller,
  Get,
  Inject,
  Param,
  Post,
  Query,
  UseGuards,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import { ApiOperation, ApiResponse } from '@nestjs/swagger';

import { VerifyUser } from 'src/auth/auth.decorators';
import { Roles } from 'src/auth/roles.decorator';
import { RolesGuard } from 'src/auth/roles.guard';

import { API_ROUTES, MANAGER_ROLES } from '../../constants/constants';
import { CacheService } from '../Cache/cache.service';
import { GlobalApplicationSettingsDto } from '../Database/database.dto';
import { DatabaseService } from '../Database/database.service';
import { AppUserDto } from '../users/users.dto';

import { AnalysisService } from './reports/analysis.service';
import {
  SimulationConversation,
  TaskRequestDto,
  TaskStatus,
} from './simulation.dto';
import { SimulationService } from './simulation.service';

@Controller(API_ROUTES.CONVERSATION_SIMULATOR())
export class SimulatorController {
  constructor(
    private service: SimulationService,
    private cache: CacheService,
    private analysisService: AnalysisService,
    @Inject(DatabaseService) private databaseService: DatabaseService,
  ) {}

  @Get(':accountId/test')
  test(@Param('accountId') accountId: string): string {
    return `${API_ROUTES.CONVERSATION_SIMULATOR()} Account ID is: ${accountId}`;
  }

  @ApiOperation({ summary: 'Stop All Tasks And Conversations For User' })
  @ApiOperation({ summary: 'Synthetic Conversation Orchestrator' })
  @ApiResponse({
    status: 200,
    description: 'Synthetic conversation has been successfully orchestrated.',
  })
  @ApiResponse({ status: 401, description: 'Unauthorized.' })
  @ApiResponse({ status: 403, description: 'Forbidden.' })
  @Post('/:accountId/stop-task-by-userid/:userId')
  @Roles(MANAGER_ROLES)
  @UseGuards(RolesGuard)
  async stopAllTasksAndConversationsForUser(
    @VerifyUser({ roles: MANAGER_ROLES }) user: AppUserDto,
    @Param('accountId') accountId: string,
    @Param('userId') userId: string,
  ): Promise<any> {
    const outcome = await this.service.stopAllTasksAndConversationsForUser(
      accountId,
      userId,
    );

    return {
      outcome,
    };
  }

  @ApiOperation({ summary: 'Run Task' })
  @ApiOperation({ summary: 'Synthetic Conversation Orchestrator' })
  @ApiResponse({
    status: 200,
    description: 'Synthetic conversation has been successfully orchestrated.',
  })
  @ApiResponse({ status: 401, description: 'Unauthorized.' })
  @ApiResponse({ status: 403, description: 'Forbidden.' })
  @Post('/:accountId/run-task')
  @Roles(MANAGER_ROLES)
  @UseGuards(RolesGuard)
  async syntheticConversationOrchestrator(
    @Body() body: TaskRequestDto,
    @VerifyUser({ roles: MANAGER_ROLES }) user: AppUserDto,
    @Param('accountId') accountId: string,
  ): Promise<any> {
    return await this.service.createTask(body, accountId, user);
  }

  @ApiOperation({ summary: 'Get Conversation By Id' })
  @ApiResponse({
    status: 200,
    description: 'The conversation has been successfully retrieved.',
  })
  @ApiResponse({ status: 401, description: 'Unauthorized.' })
  @ApiResponse({ status: 403, description: 'Forbidden.' })
  @Get('/:accountId/conversation/:conversationId')
  @Roles([])
  @UseGuards(RolesGuard)
  @UsePipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
    }),
  )
  async getConversationById(
    @Param('accountId') accountId: string,
    @Param('conversationId') conversationId: string,
    @Query('include') include: string | undefined = '',
  ): Promise<SimulationConversation> {
    const conv = await this.service.getConversation(
      accountId,
      conversationId,
      include === 'all',
    );

    return conv;
  }

  @ApiOperation({ summary: 'Get task by userId' })
  @ApiResponse({
    status: 200,
    description: 'The conversation has been successfully retrieved.',
  })
  @ApiResponse({ status: 401, description: 'Unauthorized.' })
  @ApiResponse({ status: 403, description: 'Forbidden.' })
  @Get('/:accountId/user-task/:userId')
  @UsePipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
    }),
  )
  async getConversationByUserId(
    @Param('accountId') accountId: string,
    @Param('userId') userId: string,
  ): Promise<{
    conversations: SimulationConversation[];
    task: TaskStatus;
  }> {
    return await this.cache.getTaskStatusByUserId(accountId, userId);
  }

  @ApiOperation({ summary: 'Get Task By Id' })
  @ApiResponse({
    status: 200,
    description: 'The task has been successfully retrieved.',
  })
  @ApiResponse({ status: 401, description: 'Unauthorized.' })
  @ApiResponse({ status: 403, description: 'Forbidden.' })
  @Get('/:accountId/task/:taskId')
  @UsePipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
    }),
  )
  async getTaskById(
    @Param('accountId') accountId: string,
    @Param('taskId') taskId: string,
  ): Promise<{
    conversations: SimulationConversation[];
    task: TaskStatus;
  }> {
    return await this.service.getTaskById(accountId, taskId);
  }

  @ApiOperation({ summary: 'Get Conversation By Id' })
  @ApiResponse({
    status: 200,
    description: 'The conversation has been successfully retrieved.',
  })
  @ApiResponse({ status: 401, description: 'Unauthorized.' })
  @ApiResponse({ status: 403, description: 'Forbidden.' })
  @Get('/:accountId/conversations/:userId')
  @Roles([])
  @UseGuards(RolesGuard)
  @UsePipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
    }),
  )
  async getConversationsByuserId(
    @Param('accountId') accountId: string,
    @Param('userId') userId: string,
  ): Promise<SimulationConversation[]> {
    return await this.cache.getConversationsByRequestId(accountId, userId);
  }

  @ApiOperation({ summary: 'Get All Tasks By Account' })
  @ApiResponse({
    status: 200,
    description: 'All tasks for the account have been successfully retrieved.',
  })
  @ApiResponse({ status: 401, description: 'Unauthorized.' })
  @ApiResponse({ status: 403, description: 'Forbidden.' })
  @Get('/:accountId/tasks')
  @Roles([])
  @UseGuards(RolesGuard)
  @UsePipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
    }),
  )
  async getAllCachedTasksByAccount(
    @Param('accountId') accountId: string,
  ): Promise<TaskStatus[]> {
    return await this.service.getAllCachedTasksByAccount(accountId);
  }

  @ApiOperation({ summary: 'Get Task Summary By Account' })
  @ApiResponse({
    status: 200,
    description:
      'Task summary for the account has been successfully retrieved.',
  })
  @ApiResponse({ status: 401, description: 'Unauthorized.' })
  @ApiResponse({ status: 403, description: 'Forbidden.' })
  @Get('/:accountId/task-summary')
  @Roles([])
  @UseGuards(RolesGuard)
  @UsePipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
    }),
  )
  async getTaskSummary(
    @Param('accountId') accountId: string,
  ): Promise<Partial<TaskStatus>[]> {
    return await this.analysisService.getTaskSummary(accountId);
  }

  @ApiOperation({ summary: 'Get All Conversations' })
  @ApiResponse({
    status: 200,
    description:
      'Task summary for the account has been successfully retrieved.',
  })
  @ApiResponse({ status: 401, description: 'Unauthorized.' })
  @ApiResponse({ status: 403, description: 'Forbidden.' })
  @Get('/conversations')
  @Roles([])
  @UseGuards(RolesGuard)
  @UsePipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
    }),
  )
  async getConversations(): Promise<Partial<SimulationConversation>[]> {
    return await this.cache.getAllConversationsGlobal();
  }

  @ApiOperation({ summary: 'Get All Conversations' })
  @ApiResponse({
    status: 200,
    description:
      'Task summary for the account has been successfully retrieved.',
  })
  @ApiResponse({ status: 401, description: 'Unauthorized.' })
  @ApiResponse({ status: 403, description: 'Forbidden.' })
  @Get('/tasks')
  @Roles([])
  @UseGuards(RolesGuard)
  @UsePipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
    }),
  )
  async getTasks(): Promise<Partial<TaskStatus>[]> {
    return await this.cache.getAllTasks();
  }

  @ApiOperation({ summary: 'Get All Conversations' })
  @ApiResponse({
    status: 200,
    description:
      'Task summary for the account has been successfully retrieved.',
  })
  @ApiResponse({ status: 401, description: 'Unauthorized.' })
  @ApiResponse({ status: 403, description: 'Forbidden.' })
  @Get('/global-task-status')
  @Roles([])
  @UseGuards(RolesGuard)
  @UsePipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
    }),
  )
  async getGlobalTaskStatuses(): Promise<Partial<TaskStatus>[]> {
    return (await this.cache.get('globalTaskProgress')) || [];
  }

  @ApiOperation({ summary: 'Stop Conversation By Id' })
  @ApiResponse({
    status: 200,
    description: 'The conversation has been successfully stopped.',
  })
  @ApiResponse({ status: 401, description: 'Unauthorized.' })
  @ApiResponse({ status: 403, description: 'Forbidden.' })
  @Post('/:accountId/conversation/stop/:conversationId')
  @Roles(MANAGER_ROLES)
  @UseGuards(RolesGuard)
  @UsePipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
    }),
  )
  async stopConversation(
    @Param('accountId') accountId: string,
    @Param('conversationId') conversationId: string,
  ): Promise<void> {
    await this.service.stopConversation(accountId, conversationId);
  }

  @ApiOperation({ summary: 'Resume Conversation By Id' })
  @ApiResponse({
    status: 200,
    description: 'The conversation has been successfully resumed.',
  })
  @ApiResponse({ status: 401, description: 'Unauthorized.' })
  @ApiResponse({ status: 403, description: 'Forbidden.' })
  @Post('/:accountId/conversation/resume/:conversationId')
  @Roles(MANAGER_ROLES)
  @UseGuards(RolesGuard)
  async resumeConversation(
    @Param('accountId') accountId: string,
    @Param('conversationId') conversationId: string,
  ): Promise<SimulationConversation> {
    return await this.service.resumeConversation(accountId, conversationId);
  }

  @ApiOperation({ summary: 'Pause Conversation By Id' })
  @ApiResponse({
    status: 200,
    description: 'The conversation has been successfully paused.',
  })
  @ApiResponse({ status: 401, description: 'Unauthorized.' })
  @ApiResponse({ status: 403, description: 'Forbidden.' })
  @Post('/:accountId/conversation/pause/:conversationId')
  @Roles(MANAGER_ROLES)
  @UseGuards(RolesGuard)
  async pauseConversation(
    @Param('accountId') accountId: string,
    @Param('conversationId') conversationId: string,
  ): Promise<SimulationConversation> {
    return await this.service.pauseConversation(accountId, conversationId);
  }

  @ApiOperation({ summary: 'Conclude Task By Id' })
  @ApiResponse({
    status: 200,
    description: 'The task has been successfully concluded.',
  })
  @ApiResponse({ status: 401, description: 'Unauthorized.' })
  @ApiResponse({ status: 403, description: 'Forbidden.' })
  // async concludeTask(accountId: string, task: TaskStatus):
  @Post('/:accountId/conclude-task/:taskId')
  @Roles(MANAGER_ROLES)
  @UseGuards(RolesGuard)
  async concludeTask(
    @Param('accountId') accountId: string,
    @Param('taskId') taskId: string,
  ): Promise<TaskStatus> {
    return await this.analysisService.concludeTaskById(accountId, taskId);
  }

  @Post('/:accountId/analyse-conversation/:conversationId')
  @Roles(MANAGER_ROLES)
  @UseGuards(RolesGuard)
  async analyseConversationById(
    @Param('accountId') accountId: string,
    @Param('conversationId') conversationId: string,
  ): Promise<SimulationConversation | undefined> {
    return await this.analysisService.analyseConversationById(
      accountId,
      conversationId,
    );
  }

  @Post('/:accountId/assess-conversation/:conversationId')
  @Roles(MANAGER_ROLES)
  @UseGuards(RolesGuard)
  async assessConversation(
    @Param('accountId') accountId: string,
    @Param('conversationId') conversationId: string,
    @Query('promptId') prompt: string,
  ): Promise<SimulationConversation | undefined> {
    return await this.service.assessConversation(
      accountId,
      conversationId,
      prompt,
    );
  }

  @Get('/global-application-settings')
  async getGlobalApplicationSettings(): Promise<GlobalApplicationSettingsDto> {
    return await this.databaseService.getGlobalApplicationSettings();
  }

  @Post('/global-application-settings')
  async saveGlobalApplicationSetting(
    @Body() body: { name: string; value: any },
  ): Promise<GlobalApplicationSettingsDto> {
    return await this.databaseService.saveGlobalApplicationSetting(body);
  }
}
