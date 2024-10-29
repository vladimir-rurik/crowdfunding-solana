use anchor_lang::prelude::*;
use anchor_lang::solana_program::entrypoint::ProgramResult;

declare_id!("EjRgeVUydj4PDJtqeELAnmnX5bbyTi7y7StUGfPhUg5P");

#[program]
pub mod crowdfunding {
    use super::*;

    pub fn create(ctx: Context<Create>, name: String, description: String) -> Result<()> {
        // Validate input lengths
        if name.len() > 50 {
            return Err(ErrorCode::NameTooLong.into());
        }
        if description.len() > 100 {
            return Err(ErrorCode::DescriptionTooLong.into());
        }

        let campaign = &mut ctx.accounts.campaign;
        campaign.admin = *ctx.accounts.user.key;
        campaign.name = name;
        campaign.description = description;
        campaign.amount_donated = 0;

        Ok(())
    }

    pub fn withdraw(ctx: Context<Withdraw>, amount: u64) -> ProgramResult {
        let campaign = &mut ctx.accounts.campaign;
        let user = &mut ctx.accounts.user;

        if campaign.admin != *user.key {
            return Err(ProgramError::InvalidAccountData.into());
        }

        let rent = Rent::get()?;
        let rent_exempt_balance = rent.minimum_balance(campaign.to_account_info().data_len());

        if campaign.amount_donated < amount {
            return Err(ProgramError::InsufficientFunds.into());
        }

        if campaign.to_account_info().lamports() - amount < rent_exempt_balance {
            return Err(ProgramError::InsufficientFunds.into());
        }

        **campaign.to_account_info().try_borrow_mut_lamports()? -= amount;
        **user.to_account_info().try_borrow_mut_lamports()? += amount;
        campaign.amount_donated -= amount;

        Ok(())
    }

    pub fn donate(ctx: Context<Donate>, amount: u64) -> ProgramResult {
        let ix = anchor_lang::solana_program::system_instruction::transfer(
            &ctx.accounts.user.key(),
            &ctx.accounts.campaign.key(),
            amount
        );
        anchor_lang::solana_program::program::invoke(
            &ix,
            &[
                ctx.accounts.user.to_account_info(),
                ctx.accounts.campaign.to_account_info(),
                ctx.accounts.system_program.to_account_info(),
            ],
        )?;
        (&mut ctx.accounts.campaign).amount_donated += amount;
        Ok(())
    }
}

#[error_code]
pub enum ErrorCode {
    #[msg("The provided name is too long")]
    NameTooLong,
    #[msg("The provided description is too long")]
    DescriptionTooLong,
}

#[derive(Accounts)]
pub struct Create<'info> {
    #[account(
        init,
        payer = user,
        space = 8 + 32 + 4 + 50 * 4 + 4 + 100 * 4 + 8,
        seeds = [b"CAMPAIGN_DEMO", user.key().as_ref()],
        bump
    )]
    pub campaign: Account<'info, Campaign>,
    #[account(mut)]
    pub user: Signer<'info>,
    pub system_program: Program<'info, System>,
}
#[derive(Accounts)]
pub struct Withdraw<'info> {
    #[account(mut)]
    pub campaign: Account<'info, Campaign>,
    #[account(mut)]
    pub user: Signer<'info>,
}

#[derive(Accounts)]
pub struct Donate<'info> {
    #[account(mut)]
    pub campaign: Account<'info, Campaign>,
    #[account(mut)]
    pub user: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[account]
#[derive(Default)]
pub struct Campaign {
    pub admin: Pubkey,      // 32 bytes
    pub name: String,       // 4 + len * 4 bytes
    pub description: String, // 4 + len * 4 bytes
    pub amount_donated: u64, // 8 bytes
}