import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, Max, Min } from 'class-validator';

/**
 * Query params de paginação, validados (class-validator) antes de chegar no service — página/limite
 * inválidos (negativos, zero, não-numéricos) viram 400 em vez de um `skip`/`limit` sem sentido
 * silenciosamente aceito pelo Mongoose. `limit` tem um teto (200) pra ninguém pedir a coleção
 * inteira de uma vez só via um valor absurdamente alto.
 */
export class PaginationQueryDto {
  @ApiPropertyOptional({ description: 'Página (1-indexada).', default: 1, minimum: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page: number = 1;

  @ApiPropertyOptional({ description: 'Itens por página.', default: 50, minimum: 1, maximum: 200 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(200)
  limit: number = 50;
}
