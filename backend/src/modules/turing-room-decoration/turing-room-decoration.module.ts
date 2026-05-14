import { Module } from '@nestjs/common';
import { KlingImageModule } from '../kling-image/kling-image.module';
import { RemoveBackgroundModule } from '../remove-background/remove-background.module';
import { TuringRoomDecorationService } from './turing-room-decoration.service';
import { V1RoomDecorationController } from './v1-room-decoration.controller';

@Module({
  imports: [KlingImageModule, RemoveBackgroundModule],
  controllers: [V1RoomDecorationController],
  providers: [TuringRoomDecorationService],
  exports: [TuringRoomDecorationService],
})
export class TuringRoomDecorationModule {}
