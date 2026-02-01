class TokenService
  class << self
    def issue_access_token(user, ttl: 30.days)
      verifier(:access_token).generate(
        { user_id: user.id, org_id: user.org_id, exp: ttl.from_now.to_i }
      )
    end

    def verify_access_token(token)
      verify(verifier(:access_token), token)
    end

    def issue_invite_token(user, ttl: 7.days)
      verifier(:invite_token).generate(
        { user_id: user.id, org_id: user.org_id, exp: ttl.from_now.to_i }
      )
    end

    def verify_invite_token(token)
      verify(verifier(:invite_token), token)
    end

    private

    def verifier(purpose)
      Rails.application.message_verifier(purpose)
    end

    def verify(verifier, token)
      return nil if token.blank?

      payload = verifier.verify(token).with_indifferent_access
      exp = payload[:exp].to_i
      return nil if exp.positive? && exp < Time.current.to_i

      payload
    rescue ActiveSupport::MessageVerifier::InvalidSignature
      nil
    end
  end
end
